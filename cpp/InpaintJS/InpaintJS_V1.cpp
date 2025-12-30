#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <limits>
#include <algorithm>
#include <iostream>

using namespace emscripten;
using namespace cv;
using namespace std;

// 全局參數
int patch_w = 8;
int pm_iters = 5;
const int rs_max = INT_MAX; 

const int FEATURE_CHANNELS = 7; 

// Sigma 調整: 
// 為了避免色塊，我們使用較小的基數，配合 Gradient Weight
float sigma_factor = 5.0f; // 可以嘗試 1.5 ~ 5.0
float sigma = sigma_factor * 8 * 8; 
float two_sigma_sq = 2.0f * sigma * sigma;

// Gradient 權重：強迫對齊紋理結構
const int GRADIENT_WEIGHT = 2;

static unsigned int g_seed = 12345;
inline int fast_rand() {
    g_seed = (214013 * g_seed + 2531011);
    return (g_seed >> 16) & 0x7FFF;
}

#define XY_TO_INT(x, y) (((y)<<16)|(x))
#define INT_TO_X(v) ((v)&0xFFFF)
#define INT_TO_Y(v) ((v)>>16)
#ifndef MAX
#define MAX(a, b) ((a)>(b)?(a):(b))
#define MIN(a, b) ((a)<(b)?(a):(b))
#endif

struct NNF {
    vector<int> data;
    int w, h;
    NNF() : w(0), h(0) {}
    void resize(int w_, int h_) {
        w = w_; h = h_;
        if (data.size() != w * h) data.resize(w * h);
    }
    inline int& at(int y, int x) { return data[y * w + x]; }
};

struct Box { int xmin, xmax, ymin, ymax; };

Box getBox(const Mat& mask) {
    int xmin = INT_MAX, ymin = INT_MAX;
    int xmax = 0, ymax = 0;
    bool found = false;
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
    if (!found) return {0,0,0,0};
    xmin = xmin - patch_w + 1;
    ymin = ymin - patch_w + 1;
    xmin = (xmin < 0) ? 0 : xmin;
    ymin = (ymin < 0) ? 0 : ymin;
    xmax = (xmax > mask.cols - patch_w + 1) ? mask.cols - patch_w + 1 : xmax;
    ymax = (ymax > mask.rows - patch_w + 1) ? mask.rows - patch_w + 1 : ymax;
    return {xmin, xmax, ymin, ymax};
}

// ------------------------------------------------------------------
// Helper: 獲取所有合法的來源座標 (Cache)
// ------------------------------------------------------------------
struct PointCustom { int x, y; };
vector<PointCustom> valid_pixels; // 全局緩存

void buildValidPixelList(const Mat& dilated_mask, int bew, int beh) {
    valid_pixels.clear();
    // 預留空間避免頻繁 realloc
    valid_pixels.reserve(bew * beh / 2); 
    
    for (int y = 0; y < beh; y++) {
        const uchar* ptr = dilated_mask.ptr<uchar>(y);
        for (int x = 0; x < bew; x++) {
            // 只有當 Mask != 255 (不是孔洞) 才是合法來源
            if (ptr[x] != 255) {
                valid_pixels.push_back({x, y});
            }
        }
    }
    // 如果整張圖都被 Mask 蓋住了 (極端情況)，至少塞一個點進去防止崩潰
    if (valid_pixels.empty()) {
        valid_pixels.push_back({0, 0});
    }
}

// 從合法清單中隨機取一個點
inline void getRandomValidPoint(int& x, int& y) {
    int idx = fast_rand() % valid_pixels.size();
    x = valid_pixels[idx].x;
    y = valid_pixels[idx].y;
}

// ------------------------------------------------------------------
// Core Logic
// ------------------------------------------------------------------

void calcGradient(const Mat& src, Mat& gradX, Mat& gradY, Mat& grad45, Mat& grad135) {
    Mat gray;
    if (src.channels() == 3) cvtColor(src, gray, COLOR_BGR2GRAY);
    else gray = src.clone();

    // 初始化所有梯度圖
    gradX.create(src.size(), CV_8UC1);
    gradY.create(src.size(), CV_8UC1);
    grad45.create(src.size(), CV_8UC1);
    grad135.create(src.size(), CV_8UC1);

    // 預設填入 128 (中性灰)，避免邊界未處理區域有雜訊
    gradX.setTo(Scalar(128));
    gradY.setTo(Scalar(128));
    grad45.setTo(Scalar(128));
    grad135.setTo(Scalar(128));

    // 計算 X, Y (原本的邏輯)
    for (int y = 0; y < src.rows; ++y) {
        const uchar* ptr = gray.ptr<uchar>(y);
        uchar* gx = gradX.ptr<uchar>(y);
        for (int x = 1; x < src.cols - 1; ++x) {
            gx[x] = (uchar)((ptr[x + 1] - ptr[x - 1]) / 2 + 128);
        }
    }
    for (int y = 1; y < src.rows - 1; ++y) {
        const uchar* ptr_prev = gray.ptr<uchar>(y - 1);
        const uchar* ptr_next = gray.ptr<uchar>(y + 1);
        uchar* gy = gradY.ptr<uchar>(y);
        for (int x = 0; x < src.cols; ++x) {
            gy[x] = (uchar)((ptr_next[x] - ptr_prev[x]) / 2 + 128);
        }
    }

    // --- 新增：計算斜向梯度 ---
    // 注意邊界：從 (1,1) 到 (rows-1, cols-1)
    for (int y = 1; y < src.rows - 1; ++y) {
        const uchar* ptr_prev = gray.ptr<uchar>(y - 1); // 上一行
        const uchar* ptr_next = gray.ptr<uchar>(y + 1); // 下一行
        
        uchar* g45 = grad45.ptr<uchar>(y);
        uchar* g135 = grad135.ptr<uchar>(y);

        for (int x = 1; x < src.cols - 1; ++x) {
            // 45度: 右下(x+1, y+1) - 左上(x-1, y-1)
            g45[x] = (uchar)((ptr_next[x + 1] - ptr_prev[x - 1]) / 2 + 128);

            // 135度: 左下(x-1, y+1) - 右上(x+1, y-1)
            g135[x] = (uchar)((ptr_next[x - 1] - ptr_prev[x + 1]) / 2 + 128);
        }
    }
}

void createFeatureMap(const Mat& src, const Mat& gX, const Mat& gY, const Mat& g45, const Mat& g135, Mat& dst) {
    vector<Mat> channels;
    split(src, channels); // R, G, B
    channels.push_back(gX); 
    channels.push_back(gY); 
    channels.push_back(g45);  // 新增通道 5
    channels.push_back(g135); // 新增通道 6
    merge(channels, dst);     // 總共 7 通道
}

inline int dist(const Mat& a, const Mat& b, int ax, int ay, int bx, int by, int cutoff = INT_MAX) {
    const int step_a = a.step;
    const int step_b = b.step;
    const uchar* ptr_a = a.ptr<uchar>(ay);
    const uchar* ptr_b = b.ptr<uchar>(by);
    
    // 修改這裡：乘以 7
    int idx_a = ax * FEATURE_CHANNELS; 
    int idx_b = bx * FEATURE_CHANNELS;

    int ans = 0;

    for (int dy = 0; dy < patch_w; dy++) {
        const uchar* row_a = ptr_a + idx_a;
        const uchar* row_b = ptr_b + idx_b;

        for (int dx = 0; dx < patch_w; dx++) {
            // RGB (0, 1, 2)
            int d0 = (int)row_a[0] - (int)row_b[0]; 
            int d1 = (int)row_a[1] - (int)row_b[1]; 
            int d2 = (int)row_a[2] - (int)row_b[2]; 
            int c_dist = d0*d0 + d1*d1 + d2*d2;

            // Gradient X, Y (3, 4)
            int d3 = (int)row_a[3] - (int)row_b[3]; 
            int d4 = (int)row_a[4] - (int)row_b[4]; 
            
            // --- 新增：Gradient 45, 135 (5, 6) ---
            int d5 = (int)row_a[5] - (int)row_b[5]; 
            int d6 = (int)row_a[6] - (int)row_b[6]; 

            // 將所有梯度加總並乘上權重
            // 注意：現在有 4 個梯度值，權重影響力變大了，可能需要微調 GRADIENT_WEIGHT
            int g_dist = (d3*d3 + d4*d4 + d5*d5 + d6*d6) * GRADIENT_WEIGHT;

            ans += c_dist + g_dist;
            if (ans >= cutoff) return cutoff;

            row_a += FEATURE_CHANNELS; 
            row_b += FEATURE_CHANNELS;
        }
        ptr_a += step_a; ptr_b += step_b;
    }
    return ans;
}

inline void improve_guess(const Mat& a, const Mat& b, int ax, int ay, int &xbest, int &ybest, int &dbest, int bx, int by) {
    int d = dist(a, b, ax, ay, bx, by, dbest);
    if (d < dbest) {
        dbest = d;
        xbest = bx;
        ybest = by;
    }
}

// ------------------------------------------------------------------
// Modified PatchMatch with Valid Pixel Cache
// ------------------------------------------------------------------
void patchmatch(const Mat& a, const Mat& b, NNF& ann, vector<int>& annd, const Mat& dilated_mask, bool initialize, int current_iters) {
    int aew = a.cols - patch_w + 1;
    int aeh = a.rows - patch_w + 1;
    
    // 1. 建立合法像素清單 (這步很快)
    // 我們只關心 "b" (source) 的大小
    int bew = b.cols - patch_w + 1;
    int beh = b.rows - patch_w + 1;
    buildValidPixelList(dilated_mask, bew, beh);
    
    // Initialization & Inheritance Correction
    for (int ay = 0; ay < aeh; ay++) {
        for (int ax = 0; ax < aew; ax++) {
            int bx, by;
            
            bool need_random = false;
            
            if (initialize) {
                need_random = true;
            } else {
                // 檢查繼承的點是否合法
                int v = ann.at(ay, ax);
                bx = INT_TO_X(v);
                by = INT_TO_Y(v);
                
                // 邊界檢查
                if (bx >= bew) bx = bew - 1;
                if (by >= beh) by = beh - 1;
                
                // 遮罩檢查: 如果指向孔洞，必須重置
                if (dilated_mask.ptr<uchar>(by)[bx] == 255) {
                    need_random = true;
                }
            }
            
            if (need_random) {
                // 這裡！直接從合法清單拿，絕對安全，不會有無窮迴圈
                getRandomValidPoint(bx, by);
                ann.at(ay, ax) = XY_TO_INT(bx, by);
            } else if (!initialize) {
                // 如果只是修正邊界，要寫回 NNF
                ann.at(ay, ax) = XY_TO_INT(bx, by);
            }
            
            annd[ay * a.cols + ax] = dist(a, b, ax, ay, bx, by);
        }
    }

    // Iterations
    for (int iter = 0; iter < current_iters; iter++) {
        int ystart = 0, yend = aeh, ychange = 1;
        int xstart = 0, xend = aew, xchange = 1;
        if (iter % 2 == 1) {
            xstart = xend-1; xend = -1; xchange = -1;
            ystart = yend-1; yend = -1; ychange = -1;
        }
        for (int ay = ystart; ay != yend; ay += ychange) {
            for (int ax = xstart; ax != xend; ax += xchange) {
                int v = ann.at(ay, ax);
                int xbest = INT_TO_X(v), ybest = INT_TO_Y(v);
                int dbest = annd[ay * a.cols + ax];

                // Propagation
                if ((unsigned)(ax - xchange) < (unsigned)aew) {
                    int vp = ann.at(ay, ax - xchange);
                    int xp = INT_TO_X(vp) + xchange, yp = INT_TO_Y(vp);
                    if ((unsigned)xp < (unsigned)bew && (unsigned)yp < (unsigned)beh) {
                         // 使用 Cache 清單裡的邏輯，這裡只要判斷 mask 即可
                         if (dilated_mask.ptr<uchar>(yp)[xp] != 255) {
                            improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp);
                         }
                    }
                }
                if ((unsigned)(ay - ychange) < (unsigned)aeh) {
                    int vp = ann.at(ay - ychange, ax);
                    int xp = INT_TO_X(vp), yp = INT_TO_Y(vp) + ychange;
                    if ((unsigned)xp < (unsigned)bew && (unsigned)yp < (unsigned)beh) {
                        if (dilated_mask.ptr<uchar>(yp)[xp] != 255) {
                            improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp);
                        }
                    }
                }

                // Random Search
                int rs_start = rs_max;
                if (rs_start > MAX(b.cols, b.rows)) rs_start = MAX(b.cols, b.rows);
                
                for (int mag = rs_start; mag >= 1; mag /= 2) {
                    int xmin = MAX(xbest - mag, 0), xmax = MIN(xbest + mag + 1, bew);
                    int ymin = MAX(ybest - mag, 0), ymax = MIN(ybest + mag + 1, beh);
                    
                    // 這裡的 Random Search 如果單純隨機，還是可能碰到孔洞
                    // 我們可以嘗試幾次，如果失敗就放棄這次搜索，這比 while(!valid) 安全
                    int xp = xmin + fast_rand() % (xmax - xmin);
                    int yp = ymin + fast_rand() % (ymax - ymin);
                    
                    if (dilated_mask.ptr<uchar>(yp)[xp] != 255) {
                        improve_guess(a, b, ax, ay, xbest, ybest, dbest, xp, yp);
                    }
                }
                ann.at(ay, ax) = XY_TO_INT(xbest, ybest);
                annd[ay * a.cols + ax] = dbest;
            }
        }
    }
}

void upsampleNNF(const NNF& src_ann, NNF& dst_ann, int new_w, int new_h) {
    dst_ann.resize(new_w, new_h);
    for (int y = 0; y < new_h; y++) {
        for (int x = 0; x < new_w; x++) {
            int sy = y / 2;
            int sx = x / 2;
            if (sy >= src_ann.h) sy = src_ann.h - 1;
            if (sx >= src_ann.w) sx = src_ann.w - 1;

            int v = src_ann.data[sy * src_ann.w + sx];
            int vx = INT_TO_X(v);
            int vy = INT_TO_Y(v);

            int nx = vx * 2 + (x % 2); 
            int ny = vy * 2 + (y % 2); 
            
            dst_ann.at(y, x) = XY_TO_INT(nx, ny);
        }
    }
}

Mat image_complete_js(Mat im_orig_in, Mat mask_in, int user_pm_iters, int user_patch_w) {
    patch_w = user_patch_w > 0 ? user_patch_w : 8; // 建議設為 16
    pm_iters = user_pm_iters > 0 ? user_pm_iters : 10;
    
    // Sigma 計算
    sigma = sigma_factor * patch_w * patch_w;
    two_sigma_sq = 2.0f * sigma * sigma;

    Mat im_orig;
    if (im_orig_in.channels() == 4) cvtColor(im_orig_in, im_orig, COLOR_RGBA2BGR);
    else im_orig = im_orig_in.clone();
    
    Mat mask;
    if (mask_in.channels() > 1) cvtColor(mask_in, mask, COLOR_RGBA2GRAY);
    else mask = mask_in.clone();
    threshold(mask, mask, 127, 255, THRESH_BINARY);

    // 金字塔限制: 避免圖片縮得比 patch 還小
    double target_min_size = (double)patch_w * 4.0;
    int startscale = (int)(-1 * ceil(log2(MIN(im_orig.rows, im_orig.cols) / target_min_size)));
    if (startscale > 0) startscale = 0; 
    
    NNF current_ann;
    vector<int> current_annd;
    Mat resize_img, resize_mask;
    Mat gradX, gradY, grad45, grad135, feature_img, feature_B;

    for (int logscale = startscale; logscale <= 0; logscale++) {
        double scale = pow(2, logscale);
        
        if (logscale == startscale) {
             resize(im_orig, resize_img, Size(), scale, scale, INTER_AREA);
             resize(mask, resize_mask, Size(), scale, scale, INTER_AREA);
        }
        threshold(resize_mask, resize_mask, 127, 255, THRESH_BINARY);

        // 初始化
        if (logscale == startscale) {
            current_ann.resize(resize_img.cols, resize_img.rows);
        }
        if (current_annd.size() != resize_img.cols * resize_img.rows) {
            current_annd.resize(resize_img.cols * resize_img.rows);
        }

        Box mask_box = getBox(resize_mask);
        Mat element = Mat::zeros(2*patch_w - 1, 2*patch_w - 1, CV_8UC1);
        element(Rect(patch_w - 1, patch_w - 1, patch_w, patch_w)) = 255;
        Mat dilated_mask;
        dilate(resize_mask, dilated_mask, element);

        int im_iterations = pm_iters; 

        calcGradient(resize_img, gradX, gradY, grad45, grad135);
        createFeatureMap(resize_img, gradX, gradY, grad45, grad135, feature_img);
        for (int im_iter = 0; im_iter < im_iterations; ++im_iter) {
            feature_B = feature_img.clone(); 
            
            bool is_first_init = (im_iter == 0 && logscale == startscale);
            
            patchmatch(feature_img, feature_B, 
                       current_ann, current_annd, dilated_mask, is_first_init, im_iterations);

            // Voting 重建
            Mat R = Mat::zeros(resize_img.size(), CV_32FC3);
            Mat Rcount = Mat::zeros(resize_img.size(), CV_32FC3);

            for (int y = mask_box.ymin; y < mask_box.ymax; ++y) {
                for (int x = mask_box.xmin; x < mask_box.xmax; ++x) {
                    int v = current_ann.at(y, x);
                    int xbest = INT_TO_X(v);
                    int ybest = INT_TO_Y(v);
                    
                    float d = (float)current_annd[y * resize_img.cols + x];
                    float sim = exp(-d / two_sigma_sq); 

                    for (int dy = 0; dy < patch_w; ++dy) {
                        Vec3b* src_row = resize_img.ptr<Vec3b>(ybest + dy);
                        Vec3f* r_row = R.ptr<Vec3f>(y + dy);
                        Vec3f* rc_row = Rcount.ptr<Vec3f>(y + dy);
                        
                        for (int dx = 0; dx < patch_w; ++dx) {
                            Vec3b p = src_row[xbest + dx];
                            // Accumulate
                            r_row[x + dx][0] += p[0] * sim;
                            r_row[x + dx][1] += p[1] * sim;
                            r_row[x + dx][2] += p[2] * sim;
                            rc_row[x + dx][0] += sim;
                            rc_row[x + dx][1] += sim;
                            rc_row[x + dx][2] += sim;
                        }
                    }
                }
            }
            // Average
            for (int h = 0; h < R.rows; h++) {
                Vec3f* r_ptr = R.ptr<Vec3f>(h);
                Vec3f* rc_ptr = Rcount.ptr<Vec3f>(h);
                Vec3b* img_ptr = resize_img.ptr<Vec3b>(h);
                uchar* m_ptr = resize_mask.ptr<uchar>(h);
                for (int w = 0; w < R.cols; w++) {
                    if (m_ptr[w] == 255) {
                        if (rc_ptr[w][0] > 0) {
                             img_ptr[w][0] = saturate_cast<uchar>(r_ptr[w][0] / rc_ptr[w][0]);
                             img_ptr[w][1] = saturate_cast<uchar>(r_ptr[w][1] / rc_ptr[w][1]);
                             img_ptr[w][2] = saturate_cast<uchar>(r_ptr[w][2] / rc_ptr[w][2]);
                        }
                    }
                }
            }
        }

        if (logscale < 0) {
            Mat upscale_img;
            double next_scale = pow(2, logscale + 1);
            if (logscale + 1 == 0) upscale_img = im_orig.clone(); 
            else resize(im_orig, upscale_img, Size(), next_scale, next_scale, INTER_AREA);
            
            int new_cols = upscale_img.cols;
            int new_rows = upscale_img.rows;
            resize(resize_img, resize_img, Size(new_cols, new_rows), 0, 0, INTER_CUBIC);
            resize(mask, resize_mask, Size(new_cols, new_rows), 0, 0, INTER_AREA);
            
            NNF next_ann;
            upsampleNNF(current_ann, next_ann, new_cols, new_rows);
            current_ann = next_ann; 

            Mat inverted_mask;
            bitwise_not(resize_mask, inverted_mask);
            upscale_img.copyTo(resize_img, inverted_mask);
        }
    }
    
    Mat resultRGBA;
    cvtColor(resize_img, resultRGBA, COLOR_BGR2RGBA);
    return resultRGBA;
}

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("image_complete_js", &image_complete_js);
}