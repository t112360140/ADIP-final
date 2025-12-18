#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <limits>
#include <algorithm>

using namespace emscripten;
using namespace cv;
using namespace std;

// -------------------------------------------------------------------------
// Global & Utils
// -------------------------------------------------------------------------
const int patch_w = 8;

// 快速隨機數 (比 rand() 快)
static unsigned int g_seed = 12345;
inline int fast_rand() {
    g_seed = (214013 * g_seed + 2531011);
    return (g_seed >> 16) & 0x7FFF;
}

#define XY_TO_INT(x, y) (((y)<<12)|(x))
#define INT_TO_X(v) ((v)&((1<<12)-1))
#define INT_TO_Y(v) ((v)>>12)

// NNF 結構 (使用 vector 安全管理)
struct NNF {
    vector<int> data;
    int w, h;
    NNF(int w_, int h_) : w(w_), h(h_) { 
        data.resize(w * h); 
    }
    // 支援快速重置大小，避免重新分配記憶體
    void resize(int w_, int h_) {
        w = w_; h = h_;
        if (data.size() != w * h) data.resize(w * h);
    }
    inline int& at(int y, int x) { return data[y * w + x]; }
};

// -------------------------------------------------------------------------
// Core: Distance (極致指針優化 + 嚴格紋理篩選)
// -------------------------------------------------------------------------
inline int dist(const Mat& a, const Mat& b, int ax, int ay, int bx, int by, const Mat& mask, int cutoff = INT_MAX) {
    // 1. 嚴格來源篩選 (Source Constraint)
    // 確保來源 Patch 的左上角和右下角都不在 Mask 內
    // 這保證了我們複製過來的紋理是「乾淨」的，不會把雜訊複製過來
    const uchar* m_ptr = mask.ptr<uchar>(by);
    if (m_ptr[bx] == 255) return INT_MAX;
    
    const uchar* m_ptr_btm = mask.ptr<uchar>(by + patch_w - 1);
    if (m_ptr_btm[bx + patch_w - 1] == 255) return INT_MAX;

    int ans = 0;
    
    // 2. 指針運算計算色差 (Lab)
    for (int dy = 0; dy < patch_w; dy++) {
        const uchar* a_ptr = a.ptr<uchar>(ay + dy);
        const uchar* b_ptr = b.ptr<uchar>(by + dy);
        
        int ax3 = ax * 3;
        int bx3 = bx * 3;

        for (int dx = 0; dx < patch_w; dx++) {
            int d0 = (int)a_ptr[ax3]     - (int)b_ptr[bx3];
            int d1 = (int)a_ptr[ax3 + 1] - (int)b_ptr[bx3 + 1];
            int d2 = (int)a_ptr[ax3 + 2] - (int)b_ptr[bx3 + 2];
            
            ans += d0 * d0 + d1 * d1 + d2 * d2;
            if (ans >= cutoff) return cutoff;
            
            ax3 += 3;
            bx3 += 3;
        }
    }
    return ans;
}

inline void improve_guess(const Mat& a, const Mat& b, int ax, int ay, int &xbest, int &ybest, int &dbest, int bx, int by, const Mat& mask) {
    int d = dist(a, b, ax, ay, bx, by, mask, dbest);
    if (d < dbest) {
        dbest = d;
        xbest = bx;
        ybest = by;
    }
}

// -------------------------------------------------------------------------
// PatchMatch: 分離 初始化 與 迭代
// -------------------------------------------------------------------------

// 初始化 NNF (只做一次)
void patchmatch_init(const Mat& a, const Mat& b, NNF& ann, vector<int>& annd, const Mat& mask) {
    int aew = a.cols - patch_w + 1;
    int aeh = a.rows - patch_w + 1;
    int bew = b.cols - patch_w + 1;
    int beh = b.rows - patch_w + 1;
    
    if (bew <= 0 || beh <= 0) return;

    for (int ay = 0; ay < aeh; ay++) {
        for (int ax = 0; ax < aew; ax++) {
            int bx, by;
            bool valid = false;
            int attempts = 0;
            // 尋找合法來源
            while (!valid && attempts < 20) {
                bx = fast_rand() % bew;
                by = fast_rand() % beh;
                if (mask.ptr<uchar>(by)[bx] != 255 && 
                    mask.ptr<uchar>(by + patch_w - 1)[bx + patch_w - 1] != 255) {
                    valid = true;
                }
                attempts++;
            }
            ann.at(ay, ax) = XY_TO_INT(bx, by);
            annd[ay * a.cols + ax] = dist(a, b, ax, ay, bx, by, mask);
        }
    }
}

// 迭代優化 (基於上一次的 NNF 繼續優化 -> 產生連續紋理)
void patchmatch_iterate(const Mat& a, const Mat& b, NNF& ann, vector<int>& annd, const Mat& mask, int iter_count) {
    int aew = a.cols - patch_w + 1;
    int aeh = a.rows - patch_w + 1;
    int bew = b.cols - patch_w + 1;
    int beh = b.rows - patch_w + 1;
    
    if (bew <= 0 || beh <= 0) return;

    for (int iter = 0; iter < iter_count; iter++) {
        int ystart = 0, yend = aeh, ychange = 1;
        int xstart = 0, xend = aew, xchange = 1;
        
        if (iter % 2 == 1) {
            xstart = xend - 1; xend = -1; xchange = -1;
            ystart = yend - 1; yend = -1; ychange = -1;
        }

        for (int ay = ystart; ay != yend; ay += ychange) {
            for (int ax = xstart; ax != xend; ax += xchange) {
                int& v_ref = ann.at(ay, ax);
                int& d_ref = annd[ay * a.cols + ax];
                
                int xbest = INT_TO_X(v_ref);
                int ybest = INT_TO_Y(v_ref);
                int dbest = d_ref;

                // Propagate
                if ((unsigned)(ax - xchange) < (unsigned)aew) {
                    int vp = ann.at(ay, ax - xchange);
                    int xp = INT_TO_X(vp) + xchange, yp = INT_TO_Y(vp);
                    if (xp >= 0 && xp < bew && yp >= 0 && yp < beh) {
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }
                if ((unsigned)(ay - ychange) < (unsigned)aeh) {
                    int vp = ann.at(ay - ychange, ax);
                    int xp = INT_TO_X(vp), yp = INT_TO_Y(vp) + ychange;
                    if (xp >= 0 && yp >= 0 && xp < bew && yp < beh) {
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }

                // Random Search
                int rs_start = max(bew, beh);
                for (int mag = rs_start; mag >= 1; mag /= 2) {
                    int xmin = max(0, xbest - mag);
                    int xmax = min(bew, xbest + mag + 1);
                    int ymin = max(0, ybest - mag);
                    int ymax = min(beh, ybest + mag + 1);
                    
                    if (xmax > xmin && ymax > ymin) {
                        int xp = xmin + fast_rand() % (xmax - xmin);
                        int yp = ymin + fast_rand() % (ymax - ymin);
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp, mask);
                    }
                }

                v_ref = XY_TO_INT(xbest, ybest);
                d_ref = dbest;
            }
        }
    }
}

struct Box { int xmin, xmax, ymin, ymax; };

Box getBox(const Mat& mask) {
    if (mask.empty()) return {0,0,0,0};
    int xmin = mask.cols, ymin = mask.rows, xmax = 0, ymax = 0;
    bool found = false;
    for (int y = 0; y < mask.rows; y++) {
        const uchar* ptr = mask.ptr<uchar>(y);
        for (int x = 0; x < mask.cols; x++) {
            if (ptr[x] == 255) {
                if (x < xmin) xmin = x;
                if (x > xmax) xmax = x;
                if (y < ymin) ymin = y;
                if (y > ymax) ymax = y;
                found = true;
            }
        }
    }
    if (!found) return {0, 0, 0, 0};
    return {
        max(0, xmin - patch_w), 
        min(mask.cols, xmax + patch_w + 1), 
        max(0, ymin - patch_w), 
        min(mask.rows, ymax + patch_w + 1)
    };
}

// -------------------------------------------------------------------------
// Main Function
// -------------------------------------------------------------------------

Mat image_complete_js(Mat im_orig_in, Mat mask_in, int user_iterations) {
    Mat im_orig, mask;
    
    // 轉換格式 (Lab 空間)
    if (im_orig_in.channels() == 4) {
        Mat temp; cvtColor(im_orig_in, temp, COLOR_RGBA2BGR);
        cvtColor(temp, im_orig, COLOR_BGR2Lab);
    } else { 
        cvtColor(im_orig_in, im_orig, COLOR_BGR2Lab); 
    }
    
    if (mask_in.channels() > 1) {
        cvtColor(mask_in, mask, COLOR_RGBA2GRAY);
    } else {
        mask = mask_in.clone();
    }
    threshold(mask, mask, 127, 255, THRESH_BINARY);

    if (im_orig.rows < patch_w || im_orig.cols < patch_w) {
        Mat res; cvtColor(im_orig_in, res, COLOR_BGR2RGBA); return res;
    }

    // 金字塔計算
    int min_dim = min(im_orig.rows, im_orig.cols);
    int startscale = 0;
    while ( (min_dim * pow(2, startscale - 1)) >= (patch_w + 2) ) { startscale--; }
    startscale = max(startscale, -6);

    Mat resize_img = im_orig.clone();
    Mat resize_mask = mask.clone();
    
    double scale = pow(2, startscale);
    resize(im_orig, resize_img, Size(), scale, scale, INTER_AREA);
    resize(mask, resize_mask, Size(), scale, scale, INTER_NEAREST);

    // 隨機噪點填充
    for (int y = 0; y < resize_img.rows; ++y) {
        uchar* m_ptr = resize_mask.ptr<uchar>(y);
        Vec3b* i_ptr = resize_img.ptr<Vec3b>(y);
        for (int x = 0; x < resize_img.cols; ++x) {
            if (m_ptr[x] == 255) {
                i_ptr[x] = Vec3b(fast_rand()%256, fast_rand()%256, fast_rand()%256);
            }
        }
    }

    // 準備記憶體 (Reuse Memory)
    // 宣告在迴圈外，讓它們能跨迭代保持狀態
    NNF ann(0, 0); 
    vector<int> annd;

    for (int logscale = startscale; logscale <= 0; logscale++) {
        
        // 確保 ann 大小正確
        ann.resize(resize_img.cols, resize_img.rows);
        if (annd.size() != resize_img.cols * resize_img.rows) {
            annd.resize(resize_img.cols * resize_img.rows);
        }

        Mat element = Mat::zeros(2*patch_w-1, 2*patch_w-1, CV_8UC1);
        element(Rect(patch_w-1, patch_w-1, patch_w, patch_w)) = 255;
        Mat dilated_mask;
        dilate(resize_mask, dilated_mask, element);
        
        Box mask_box = getBox(resize_mask);
        
        // 【關鍵】每一層開始時，做一次全新的初始化
        // 這樣可以讓新的 Scale 有一個好的隨機起點
        patchmatch_init(resize_img, resize_img, ann, annd, dilated_mask);

        // 主迴圈
        for (int im_iter = 0; im_iter < user_iterations; ++im_iter) {
            
            // 【關鍵】這裡只做 Iterate (Refine)，不做 Init
            // 這樣 ann 會記住上一圈的結果，紋理會越來越清晰
            patchmatch_iterate(resize_img, resize_img, ann, annd, dilated_mask, 2); 
            // 註：iter_count 可以設小一點 (如 2)，因為我們外部迴圈跑很多次

            // Direct Copy (指針優化版)
            int max_ann_y = resize_img.rows - patch_w;
            int max_ann_x = resize_img.cols - patch_w;

            for (int y = mask_box.ymin; y < mask_box.ymax; ++y) {
                // 基本邊界檢查，防止超出圖像本身
                if (y >= resize_img.rows) continue;
                
                uchar* m_ptr = resize_mask.ptr<uchar>(y);
                Vec3b* img_row = resize_img.ptr<Vec3b>(y);

                for (int x = mask_box.xmin; x < mask_box.xmax; ++x) {
                    if (x >= resize_img.cols) continue;
                    
                    if (m_ptr[x] == 255) {
                        // 關鍵修改：
                        // 如果 (x, y) 超出了 NNF 計算範圍 (在邊緣)，
                        // 我們就 "Clamp" (夾具) 到最近的一個有效 Patch 位置 (ay, ax)
                        int ay = (y < max_ann_y) ? y : max_ann_y;
                        int ax = (x < max_ann_x) ? x : max_ann_x;

                        // 取出該 Patch 指向的來源
                        int v = ann.at(ay, ax);
                        int bx_base = INT_TO_X(v);
                        int by_base = INT_TO_Y(v);
                        
                        // 計算偏差值 (Offset)
                        // 如果我們是在邊緣借用上面的 Patch，需要加上位移量
                        int dy = y - ay;
                        int dx = x - ax;

                        // 計算實際來源像素位置
                        int source_x = bx_base + dx;
                        int source_y = by_base + dy;

                        // 確保來源像素也在圖片範圍內 (通常 NNF 產生時已保證，但加上 offset 後需再檢查)
                        if (source_x < resize_img.cols && source_y < resize_img.rows) {
                            img_row[x] = resize_img.at<Vec3b>(source_y, source_x);
                        }
                    }
                }
            }
        }

        // Upscale
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
            // 注意：下一圈 NNF 會 resize 並 init，所以這裡不用擔心 NNF 尺寸
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