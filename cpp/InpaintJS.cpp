#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <iostream>
#include <vector>
#include <cmath>
#include <limits>

using namespace emscripten;
using namespace cv;
using namespace std;

// -------------------------------------------------------------------------
// Helper: BITMAP class
// -------------------------------------------------------------------------
class BITMAP {
public:
    int w, h;
    int *data;
    BITMAP(int w_, int h_) : w(w_), h(h_) {
        // [FIX] Ensure valid dimensions
        if (w <= 0 || h <= 0) { w = 0; h = 0; data = NULL; return; }
        data = new int[w * h];
        memset(data, 0, sizeof(int) * w * h);
    }
    ~BITMAP() { if(data) delete[] data; }
    int *operator[](int y) { return &data[y * w]; }
};

// -------------------------------------------------------------------------
// Global Parameters
// -------------------------------------------------------------------------
int patch_w = 8;
int rs_max = INT_MAX; 

#define XY_TO_INT(x, y) (((y)<<12)|(x))
#define INT_TO_X(v) ((v)&((1<<12)-1))
#define INT_TO_Y(v) ((v)>>12)

#ifndef MAX
#define MAX(a, b) ((a)>(b)?(a):(b))
#define MIN(a, b) ((a)<(b)?(a):(b))
#endif

// -------------------------------------------------------------------------
// Core Logic
// -------------------------------------------------------------------------

struct Box {
    int xmin, xmax, ymin, ymax;
};

Box getBox(const Mat& mask) {
    int xmin = INT_MAX, ymin = INT_MAX;
    int xmax = 0, ymax = 0;
    bool found = false;
    
    // Safety check for empty mask
    if (mask.empty()) return {0, 0, 0, 0};

    for (int h = 0; h < mask.rows; h++) {
        const uchar* ptr = mask.ptr<uchar>(h);
        for (int w = 0; w < mask.cols; w++) {
            if (ptr[w] == 255) { 
                if (h < ymin) ymin = h;
                if (h > ymax) ymax = h;
                if (w < xmin) xmin = w;
                if (w > xmax) xmax = w;
                found = true;
            }
        }
    }
    
    if (!found) return {0, 0, 0, 0};

    xmin = MAX(0, xmin - patch_w);
    ymin = MAX(0, ymin - patch_w);
    xmax = MIN(mask.cols - 1, xmax + patch_w);
    ymax = MIN(mask.rows - 1, ymax + patch_w);

    return {xmin, xmax, ymin, ymax};
}

int dist(const Mat& a, const Mat& b, int ax, int ay, int bx, int by, const Mat& mask, int cutoff = INT_MAX) {
    long long ans = 0;
    
    // Bounds check protection (Important for stability)
    if (bx < 0 || by < 0 || bx > b.cols - patch_w || by > b.rows - patch_w) return INT_MAX;

    if (mask.at<uchar>(by, bx) == 255 || 
        mask.at<uchar>(by + patch_w - 1, bx + patch_w - 1) == 255) {
        return INT_MAX;
    }

    for (int dy = 0; dy < patch_w; dy++) {
        const Vec3b* arow = a.ptr<Vec3b>(ay + dy);
        const Vec3b* brow = b.ptr<Vec3b>(by + dy);
        for (int dx = 0; dx < patch_w; dx++) {
            const Vec3b& ac = arow[ax + dx];
            const Vec3b& bc = brow[bx + dx];

            int d0 = (int)ac[0] - (int)bc[0];
            int d1 = (int)ac[1] - (int)bc[1];
            int d2 = (int)ac[2] - (int)bc[2];
            ans += d0 * d0 + d1 * d1 + d2 * d2;
        }
        if (ans >= cutoff) return cutoff;
    }
    return (int)ans;
}

void improve_guess(const Mat& a, const Mat& b, int ax, int ay, int &xbest, int &ybest, int &dbest, int bx, int by, const Mat& mask) {
    int d = dist(a, b, ax, ay, bx, by, mask, dbest);
    if (d < dbest) {
        dbest = d;
        xbest = bx;
        ybest = by;
    }
}

void patchmatch(const Mat& a, const Mat& b, BITMAP *&ann, BITMAP *&annd, const Mat& mask, int pm_iters) {
    // [FIX] Always delete and set to NULL to prevent double free logic issues
    if (ann) { delete ann; ann = NULL; }
    if (annd) { delete annd; annd = NULL; }
    
    // [FIX] Check for image too small for patch
    if (a.cols < patch_w || a.rows < patch_w) return;

    ann = new BITMAP(a.cols, a.rows);
    annd = new BITMAP(a.cols, a.rows);
    
    int aew = a.cols - patch_w + 1;
    int aeh = a.rows - patch_w + 1;
    int bew = b.cols - patch_w + 1;
    int beh = b.rows - patch_w + 1;

    for (int ay = 0; ay < aeh; ay++) {
        for (int ax = 0; ax < aew; ax++) {
            int bx, by;
            bool valid = false;
            int attempts = 0;
            while (!valid && attempts < 100) {
                bx = rand() % bew;
                by = rand() % beh;
                if (mask.at<uchar>(by, bx) != 255) valid = true;
                attempts++;
            }
            (*ann)[ay][ax] = XY_TO_INT(bx, by);
            (*annd)[ay][ax] = dist(a, b, ax, ay, bx, by, mask);
        }
    }

    for (int iter = 0; iter < pm_iters; iter++) {
        int ystart = 0, yend = aeh, ychange = 1;
        int xstart = 0, xend = aew, xchange = 1;
        
        if (iter % 2 == 1) {
            xstart = xend - 1; xend = -1; xchange = -1;
            ystart = yend - 1; yend = -1; ychange = -1;
        }

        for (int ay = ystart; ay != yend; ay += ychange) {
            for (int ax = xstart; ax != xend; ax += xchange) {
                int v = (*ann)[ay][ax];
                int xbest = INT_TO_X(v), ybest = INT_TO_Y(v);
                int dbest = (*annd)[ay][ax];

                if ((unsigned)(ax - xchange) < (unsigned)aew) {
                    int vp = (*ann)[ay][ax - xchange];
                    int xp = INT_TO_X(vp) + xchange, yp = INT_TO_Y(vp);
                    // [FIX] Cast strictly to int for comparison before unsigned cast
                    if (xp >= 0 && yp >= 0 && xp < bew && yp < beh) {
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }
                if ((unsigned)(ay - ychange) < (unsigned)aeh) {
                    int vp = (*ann)[ay - ychange][ax];
                    int xp = INT_TO_X(vp), yp = INT_TO_Y(vp) + ychange;
                    if (xp >= 0 && yp >= 0 && xp < bew && yp < beh) {
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }

                int rs_start = rs_max;
                if (rs_start > MAX(b.cols, b.rows)) rs_start = MAX(b.cols, b.rows);
                for (int mag = rs_start; mag >= 1; mag /= 2) {
                    int xmin = MAX(xbest - mag, 0), xmax = MIN(xbest + mag + 1, bew);
                    int ymin = MAX(ybest - mag, 0), ymax = MIN(ybest + mag + 1, beh);
                    // [FIX] Avoid modulo by zero if xmax == xmin
                    if (xmax > xmin && ymax > ymin) {
                        int xp = xmin + rand() % (xmax - xmin);
                        int yp = ymin + rand() % (ymax - ymin);
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }

                (*ann)[ay][ax] = XY_TO_INT(xbest, ybest);
                (*annd)[ay][ax] = dbest;
            }
        }
    }
}

// -------------------------------------------------------------------------
// Main Function
// -------------------------------------------------------------------------

Mat image_complete_js(Mat im_orig_in, Mat mask_in, int user_iterations, emscripten::val on_progress) {
    
    Mat im_orig, mask;
    
    // [FIX] 1. Force 3-channel BGR -> Lab. Handle Gray (1ch) or BGRA (4ch).
    // The dist() function uses ptr<Vec3b>, so we MUST ensure the Mat is CV_8UC3.
    if (im_orig_in.channels() == 4) {
        Mat temp;
        cvtColor(im_orig_in, temp, COLOR_RGBA2BGR);
        cvtColor(temp, im_orig, COLOR_BGR2Lab);
    } else if (im_orig_in.channels() == 3) {
        cvtColor(im_orig_in, im_orig, COLOR_BGR2Lab);
    } else if (im_orig_in.channels() == 1) {
        Mat temp;
        cvtColor(im_orig_in, temp, COLOR_GRAY2BGR); // Convert Gray to BGR first
        cvtColor(temp, im_orig, COLOR_BGR2Lab);
    } else {
        // Fallback, but might crash if not 3 channels.
        im_orig_in.copyTo(im_orig);
    }

    if (mask_in.channels() > 1) {
        cvtColor(mask_in, mask, COLOR_RGBA2GRAY);
    } else {
        mask = mask_in.clone();
    }
    threshold(mask, mask, 127, 255, THRESH_BINARY); 

    int rows = im_orig.rows;
    int cols = im_orig.cols;
    
    // [FIX] If image is too small for patch size, return immediately
    if (rows < patch_w || cols < patch_w) {
        Mat resultRGBA;
        cvtColor(im_orig_in, resultRGBA, COLOR_BGR2RGBA); // Return original
        return resultRGBA;
    }

    int startscale = (int)-1 * ceil(log2(MIN(rows, cols))) + 3; 
    if(startscale > 0) startscale = 0; 

    double total_work = 0;
    for (int s = startscale; s <= 0; s++) total_work += pow(4, s) * user_iterations;
    double current_work = 0;

    Mat resize_img = im_orig.clone();
    Mat resize_mask = mask.clone();
    
    double scale = pow(2, startscale);
    resize(im_orig, resize_img, Size(), scale, scale, INTER_AREA);
    resize(mask, resize_mask, Size(), scale, scale, INTER_NEAREST); 

    // Safety: ensure resize didn't make it too small
    if (resize_img.rows < patch_w || resize_img.cols < patch_w) {
        resize(im_orig, resize_img, Size(), 1.0, 1.0); // Reset to orig if too small
        resize(mask, resize_mask, Size(), 1.0, 1.0);
    }

    for (int y = 0; y < resize_img.rows; ++y) {
        for (int x = 0; x < resize_img.cols; ++x) {
            if (resize_mask.at<uchar>(y, x) == 255) {
                resize_img.at<Vec3b>(y, x) = Vec3b(rand()%256, rand()%256, rand()%256);
            }
        }
    }

    for (int logscale = startscale; logscale <= 0; logscale++) {
        
        Mat element = Mat::zeros(2 * patch_w - 1, 2 * patch_w - 1, CV_8UC1);
        element(Rect(patch_w - 1, patch_w - 1, patch_w, patch_w)) = 255;
        Mat dilated_mask;
        dilate(resize_mask, dilated_mask, element);

        Box mask_box = getBox(resize_mask);
        
        for (int im_iter = 0; im_iter < user_iterations; ++im_iter) {
            
            if (on_progress.typeOf().as<std::string>() == "function") {
                double iter_weight = pow(4, logscale); 
                current_work += iter_weight;
                double progress = MIN(1.0, current_work / total_work);
                on_progress(val(progress));
            }

            // [FIX] Initialize to NULL
            BITMAP *ann = NULL, *annd = NULL;
            
            patchmatch(resize_img, resize_img, ann, annd, dilated_mask, 5); 

            // [FIX] Safety check: ann might be null if patchmatch failed/skipped
            if (ann != NULL) {
                for (int y = mask_box.ymin; y < mask_box.ymax; ++y) {
                    if (y >= resize_img.rows - patch_w) continue;
                    
                    for (int x = mask_box.xmin; x < mask_box.xmax; ++x) {
                        if (x >= resize_img.cols - patch_w) continue;

                        if (resize_mask.at<uchar>(y, x) == 255) {
                            int v = (*ann)[y][x];
                            int bx = INT_TO_X(v);
                            int by = INT_TO_Y(v);
                            
                            // [FIX] Final bounds check before write
                            if (bx < resize_img.cols && by < resize_img.rows) {
                                resize_img.at<Vec3b>(y, x) = resize_img.at<Vec3b>(by, bx);
                            }
                        }
                    }
                }
            }

            // [FIX] 2. Set pointers to NULL after delete to avoid double-free in next iteration logic (if any)
            if (ann) { delete ann; ann = NULL; }
            if (annd) { delete annd; annd = NULL; }
        }

        if (logscale < 0) {
            Mat upscale_img;
            resize(resize_img, upscale_img, Size(), 2.0, 2.0, INTER_CUBIC); 
            
            resize(mask, resize_mask, upscale_img.size(), 0, 0, INTER_NEAREST);
            
            Mat inverted_mask;
            bitwise_not(resize_mask, inverted_mask);
            
            Mat current_orig_scaled;
            resize(im_orig, current_orig_scaled, upscale_img.size(), 0, 0, INTER_AREA);
            current_orig_scaled.copyTo(upscale_img, inverted_mask); 
            
            resize_img = upscale_img;
        }
    }

    Mat resultBGR, resultRGBA;
    cvtColor(resize_img, resultBGR, COLOR_Lab2BGR);
    cvtColor(resultBGR, resultRGBA, COLOR_BGR2RGBA);

    return resultRGBA;
}

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("image_complete_js", &image_complete_js);
}