// https://github.com/vacancy/PyPatchMatch
// Slow

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

// =========================================================================
// 1. MaskedImage Class (Header + Implementation)
// =========================================================================

static unsigned int g_seed = 12345;
inline int fast_rand() {
    g_seed = (214013 * g_seed + 2531011);
    return (g_seed >> 16) & 0x7FFF;
}

// 為了相容原本的介面，我們加一個設定種子的函式
void fast_srand(int seed) {
    g_seed = seed;
}


class MaskedImage {
public:
    MaskedImage() : m_image(), m_mask(), m_global_mask(), m_image_grady(), m_image_gradx(), m_image_grad_computed(false) {}
    
    MaskedImage(cv::Mat image, cv::Mat mask) : m_image(image), m_mask(mask), m_image_grad_computed(false) {}
    
    MaskedImage(cv::Mat image, cv::Mat mask, cv::Mat global_mask) 
        : m_image(image), m_mask(mask), m_global_mask(global_mask), m_image_grad_computed(false) {}
        
    MaskedImage(cv::Mat image, cv::Mat mask, cv::Mat global_mask, cv::Mat grady, cv::Mat gradx, bool grad_computed) :
        m_image(image), m_mask(mask), m_global_mask(global_mask),
        m_image_grady(grady), m_image_gradx(gradx), m_image_grad_computed(grad_computed) {}

    MaskedImage(int width, int height) : m_global_mask(), m_image_grady(), m_image_gradx() {
        m_image = cv::Mat(cv::Size(width, height), CV_8UC3);
        m_image = cv::Scalar::all(0);
        m_mask = cv::Mat(cv::Size(width, height), CV_8U);
        m_mask = cv::Scalar::all(0);
    }

    inline MaskedImage clone() {
        return MaskedImage(
            m_image.clone(), m_mask.clone(), m_global_mask.clone(),
            m_image_grady.clone(), m_image_gradx.clone(), m_image_grad_computed
        );
    }

    inline cv::Size size() const { return m_image.size(); }
    inline const cv::Mat &image() const { return m_image; }
    inline const cv::Mat &mask() const { return m_mask; }
    inline const cv::Mat &global_mask() const { return m_global_mask; }
    inline const cv::Mat &grady() const { assert(m_image_grad_computed); return m_image_grady; }
    inline const cv::Mat &gradx() const { assert(m_image_grad_computed); return m_image_gradx; }

    inline void init_global_mask_mat() {
        m_global_mask = cv::Mat(m_mask.size(), CV_8U);
        m_global_mask.setTo(cv::Scalar(0));
    }
    inline void set_global_mask_mat(const cv::Mat &other) { m_global_mask = other; }

    inline bool is_masked(int y, int x) const { return static_cast<bool>(m_mask.at<unsigned char>(y, x)); }
    inline bool is_globally_masked(int y, int x) const { return !m_global_mask.empty() && static_cast<bool>(m_global_mask.at<unsigned char>(y, x)); }
    inline void set_mask(int y, int x, bool value) { m_mask.at<unsigned char>(y, x) = static_cast<unsigned char>(value); }
    inline void set_global_mask(int y, int x, bool value) { m_global_mask.at<unsigned char>(y, x) = static_cast<unsigned char>(value); }
    inline void clear_mask() { m_mask.setTo(cv::Scalar(0)); }

    inline const unsigned char *get_image(int y, int x) const { return m_image.ptr<unsigned char>(y, x); }
    inline unsigned char *get_mutable_image(int y, int x) { return m_image.ptr<unsigned char>(y, x); }

    bool contains_mask(int y, int x, int patch_size) const;
    MaskedImage downsample() const;
    MaskedImage upsample(int new_w, int new_h) const;
    MaskedImage upsample(int new_w, int new_h, const cv::Mat &new_global_mask) const;
    void compute_image_gradients();
    void compute_image_gradients() const;

    static const cv::Size kDownsampleKernelSize;
    static const int kDownsampleKernel[6];

private:
    cv::Mat m_image;
    cv::Mat m_mask;
    cv::Mat m_global_mask;
    cv::Mat m_image_grady;
    cv::Mat m_image_gradx;
    bool m_image_grad_computed = false;
};

// MaskedImage Implementation
const cv::Size MaskedImage::kDownsampleKernelSize = cv::Size(6, 6);
const int MaskedImage::kDownsampleKernel[6] = {1, 5, 10, 10, 5, 1};

bool MaskedImage::contains_mask(int y, int x, int patch_size) const {
    auto mask_size = size();
    for (int dy = -patch_size; dy <= patch_size; ++dy) {
        for (int dx = -patch_size; dx <= patch_size; ++dx) {
            int yy = y + dy, xx = x + dx;
            if (yy >= 0 && yy < mask_size.height && xx >= 0 && xx < mask_size.width) {
                if (is_masked(yy, xx) && !is_globally_masked(yy, xx)) return true;
            }
        }
    }
    return false;
}

MaskedImage MaskedImage::downsample() const {
    const auto &kernel_size = MaskedImage::kDownsampleKernelSize;
    const auto &kernel = MaskedImage::kDownsampleKernel;

    const auto size = this->size();
    const auto new_size = cv::Size(size.width / 2, size.height / 2);

    auto ret = MaskedImage(new_size.width, new_size.height);
    if (!m_global_mask.empty()) ret.init_global_mask_mat();
    for (int y = 0; y < size.height - 1; y += 2) {
        for (int x = 0; x < size.width - 1; x += 2) {
            int r = 0, g = 0, b = 0, ksum = 0;
            bool is_gmasked = true;

            for (int dy = -kernel_size.height / 2 + 1; dy <= kernel_size.height / 2; ++dy) {
                for (int dx = -kernel_size.width / 2 + 1; dx <= kernel_size.width / 2; ++dx) {
                    int yy = y + dy, xx = x + dx;
                    if (yy >= 0 && yy < size.height && xx >= 0 && xx < size.width) {
                        if (!is_globally_masked(yy, xx)) {
                            is_gmasked = false;
                        }
                        if (!is_masked(yy, xx)) {
                            auto source_ptr = get_image(yy, xx);
                            int k = kernel[kernel_size.height / 2 - 1 + dy] * kernel[kernel_size.width / 2 - 1 + dx];
                            r += source_ptr[0] * k, g += source_ptr[1] * k, b += source_ptr[2] * k;
                            ksum += k;
                        }
                    }
                }
            }

            if (ksum > 0) r /= ksum, g /= ksum, b /= ksum;

            if (!m_global_mask.empty()) {
                ret.set_global_mask(y / 2, x / 2, is_gmasked);
            }
            if (ksum > 0) {
                auto target_ptr = ret.get_mutable_image(y / 2, x / 2);
                target_ptr[0] = r, target_ptr[1] = g, target_ptr[2] = b;
                ret.set_mask(y / 2, x / 2, 0);
            } else {
                ret.set_mask(y / 2, x / 2, 1);
            }
        }
    }
    return ret;
}

MaskedImage MaskedImage::upsample(int new_w, int new_h) const {
    const auto size = this->size();
    auto ret = MaskedImage(new_w, new_h);
    if (!m_global_mask.empty()) ret.init_global_mask_mat();
    for (int y = 0; y < new_h; ++y) {
        for (int x = 0; x < new_w; ++x) {
            int yy = y * size.height / new_h;
            int xx = x * size.width / new_w;

            if (is_globally_masked(yy, xx)) {
                ret.set_global_mask(y, x, 1);
                ret.set_mask(y, x, 1);
            } else {
                if (!m_global_mask.empty()) ret.set_global_mask(y, x, 0);

                if (is_masked(yy, xx)) {
                    ret.set_mask(y, x, 1);
                } else {
                    auto source_ptr = get_image(yy, xx);
                    auto target_ptr = ret.get_mutable_image(y, x);
                    for (int c = 0; c < 3; ++c)
                        target_ptr[c] = source_ptr[c];
                    ret.set_mask(y, x, 0);
                }
            }
        }
    }
    return ret;
}

MaskedImage MaskedImage::upsample(int new_w, int new_h, const cv::Mat &new_global_mask) const {
    auto ret = upsample(new_w, new_h);
    ret.set_global_mask_mat(new_global_mask);
    return ret;
}

void MaskedImage::compute_image_gradients() {
    if (m_image_grad_computed) return;

    const auto size = m_image.size();
    m_image_grady = cv::Mat(size, CV_8UC3);
    m_image_gradx = cv::Mat(size, CV_8UC3);
    m_image_grady = cv::Scalar::all(0);
    m_image_gradx = cv::Scalar::all(0);

    for (int i = 1; i < size.height - 1; ++i) {
        const auto *ptry1 = m_image.ptr<unsigned char>(i + 1, 0);
        const auto *ptry2 = m_image.ptr<unsigned char>(i - 1, 0);
        const auto *ptrx1 = m_image.ptr<unsigned char>(i, 0) + 3;
        const auto *ptrx2 = m_image.ptr<unsigned char>(i, 0) - 3;
        auto *mptry = m_image_grady.ptr<unsigned char>(i, 0);
        auto *mptrx = m_image_gradx.ptr<unsigned char>(i, 0);
        for (int j = 3; j < size.width * 3 - 3; ++j) {
            mptry[j] = (ptry1[j] / 2 - ptry2[j] / 2) + 128;
            mptrx[j] = (ptrx1[j] / 2 - ptrx2[j] / 2) + 128;
        }
    }
    m_image_grad_computed = true;
}

void MaskedImage::compute_image_gradients() const {
    const_cast<MaskedImage *>(this)->compute_image_gradients();
}


// =========================================================================
// 2. Metrics & NNF
// =========================================================================

class PatchDistanceMetric {
public:
    PatchDistanceMetric(int patch_size) : m_patch_size(patch_size) {}
    virtual ~PatchDistanceMetric() = default;

    inline int patch_size() const { return m_patch_size; }
    virtual int operator()(const MaskedImage &source, int source_y, int source_x, const MaskedImage &target, int target_y, int target_x) const = 0;
    static const int kDistanceScale;

protected:
    int m_patch_size;
};

const int PatchDistanceMetric::kDistanceScale = 65535;

class PatchSSDDistanceMetric : public PatchDistanceMetric {
public:
    using PatchDistanceMetric::PatchDistanceMetric;
    virtual int operator ()(const MaskedImage &source, int source_y, int source_x, const MaskedImage &target, int target_y, int target_x) const;
    static const int kSSDScale;
};

const int PatchSSDDistanceMetric::kSSDScale = 9 * 255 * 255;

// Helper implementation for Distance
namespace {
    inline int pow2(int i) { return i * i; }

    int distance_masked_images(
        const MaskedImage &source, int ys, int xs,
        const MaskedImage &target, int yt, int xt,
        int patch_size
    ) {
        long double distance = 0;
        long double wsum = 0;

        source.compute_image_gradients();
        target.compute_image_gradients();

        auto source_size = source.size();
        auto target_size = target.size();

        for (int dy = -patch_size; dy <= patch_size; ++dy) {
            const int yys = ys + dy, yyt = yt + dy;

            if (yys <= 0 || yys >= source_size.height - 1 || yyt <= 0 || yyt >= target_size.height - 1) {
                distance += (long double)(PatchSSDDistanceMetric::kSSDScale) * (2 * patch_size + 1);
                wsum += 2 * patch_size + 1;
                continue;
            }

            const auto *p_si = source.image().ptr<unsigned char>(yys, 0);
            const auto *p_ti = target.image().ptr<unsigned char>(yyt, 0);
            const auto *p_sm = source.mask().ptr<unsigned char>(yys, 0);
            const auto *p_tm = target.mask().ptr<unsigned char>(yyt, 0);

            const unsigned char *p_sgm = nullptr;
            const unsigned char *p_tgm = nullptr;
            if (!source.global_mask().empty()) {
                p_sgm = source.global_mask().ptr<unsigned char>(yys, 0);
                p_tgm = target.global_mask().ptr<unsigned char>(yyt, 0);
            }

            const auto *p_sgy = source.grady().ptr<unsigned char>(yys, 0);
            const auto *p_tgy = target.grady().ptr<unsigned char>(yyt, 0);
            const auto *p_sgx = source.gradx().ptr<unsigned char>(yys, 0);
            const auto *p_tgx = target.gradx().ptr<unsigned char>(yyt, 0);

            for (int dx = -patch_size; dx <= patch_size; ++dx) {
                int xxs = xs + dx, xxt = xt + dx;
                wsum += 1;

                if (xxs <= 0 || xxs >= source_size.width - 1 || xxt <= 0 || xxt >= source_size.width - 1) {
                    distance += PatchSSDDistanceMetric::kSSDScale;
                    continue;
                }

                if (p_sm[xxs] || p_tm[xxt] || (p_sgm && p_sgm[xxs]) || (p_tgm && p_tgm[xxt]) ) {
                    distance += PatchSSDDistanceMetric::kSSDScale;
                    continue;
                }

                int ssd = 0;
                for (int c = 0; c < 3; ++c) {
                    int s_value = p_si[xxs * 3 + c];
                    int t_value = p_ti[xxt * 3 + c];
                    int s_gy = p_sgy[xxs * 3 + c];
                    int t_gy = p_tgy[xxt * 3 + c];
                    int s_gx = p_sgx[xxs * 3 + c];
                    int t_gx = p_tgx[xxt * 3 + c];

                    ssd += pow2(static_cast<int>(s_value) - t_value);
                    ssd += pow2(static_cast<int>(s_gx) - t_gx);
                    ssd += pow2(static_cast<int>(s_gy) - t_gy);
                }
                distance += ssd;
            }
        }

        distance /= (long double)(PatchSSDDistanceMetric::kSSDScale);

        int res = int(PatchDistanceMetric::kDistanceScale * distance / wsum);
        if (res < 0 || res > PatchDistanceMetric::kDistanceScale) return PatchDistanceMetric::kDistanceScale;
        return res;
    }
}

int PatchSSDDistanceMetric::operator ()(const MaskedImage &source, int source_y, int source_x, const MaskedImage &target, int target_y, int target_x) const {
    return distance_masked_images(source, source_y, source_x, target, target_y, target_x, m_patch_size);
}

class NearestNeighborField {
public:
    NearestNeighborField() : m_source(), m_target(), m_field(), m_distance_metric(nullptr) {}
    NearestNeighborField(const MaskedImage &source, const MaskedImage &target, const PatchDistanceMetric *metric, int max_retry = 20)
        : m_source(source), m_target(target), m_distance_metric(metric) {
        m_field = cv::Mat(m_source.size(), CV_32SC3);
        _randomize_field(max_retry);
    }
    NearestNeighborField(const MaskedImage &source, const MaskedImage &target, const PatchDistanceMetric *metric, const NearestNeighborField &other, int max_retry = 20)
            : m_source(source), m_target(target), m_distance_metric(metric) {
        m_field = cv::Mat(m_source.size(), CV_32SC3);
        _initialize_field_from(other, max_retry);
    }

    const MaskedImage &source() const { return m_source; }
    const MaskedImage &target() const { return m_target; }
    inline cv::Size source_size() const { return m_source.size(); }
    inline cv::Size target_size() const { return m_target.size(); }
    inline void set_source(const MaskedImage &source) { m_source = source; }
    inline void set_target(const MaskedImage &target) { m_target = target; }

    inline int *mutable_ptr(int y, int x) { return m_field.ptr<int>(y, x); }
    inline const int *ptr(int y, int x) const { return m_field.ptr<int>(y, x); }

    inline int at(int y, int x, int c) const { return m_field.ptr<int>(y, x)[c]; }
    inline int &at(int y, int x, int c) { return m_field.ptr<int>(y, x)[c]; }
    inline void set_identity(int y, int x) {
        auto ptr = mutable_ptr(y, x);
        ptr[0] = y, ptr[1] = x, ptr[2] = 0;
    }

    void minimize(int nr_pass);

private:
    inline int _distance(int source_y, int source_x, int target_y, int target_x) {
        return (*m_distance_metric)(m_source, source_y, source_x, m_target, target_y, target_x);
    }

    void _randomize_field(int max_retry = 20, bool reset = true);
    void _initialize_field_from(const NearestNeighborField &other, int max_retry);
    void _minimize_link(int y, int x, int direction);

    MaskedImage m_source;
    MaskedImage m_target;
    cv::Mat m_field;  // { y_target, x_target, distance_scaled }
    const PatchDistanceMetric *m_distance_metric;
};

// NNF Implementation
// REMOVED custom clamp function, relying on std::clamp from <algorithm>

void NearestNeighborField::_randomize_field(int max_retry, bool reset) {
    auto this_size = source_size();
    for (int i = 0; i < this_size.height; ++i) {
        for (int j = 0; j < this_size.width; ++j) {
            if (m_source.is_globally_masked(i, j)) continue;

            auto this_ptr = mutable_ptr(i, j);
            int distance = reset ? PatchDistanceMetric::kDistanceScale : this_ptr[2];
            if (distance < PatchDistanceMetric::kDistanceScale) continue;

            int i_target = 0, j_target = 0;
            for (int t = 0; t < max_retry; ++t) {
                i_target = fast_rand() % this_size.height;
                j_target = fast_rand() % this_size.width;
                if (m_target.is_globally_masked(i_target, j_target)) continue;

                distance = _distance(i, j, i_target, j_target);
                if (distance < PatchDistanceMetric::kDistanceScale) break;
            }
            this_ptr[0] = i_target, this_ptr[1] = j_target, this_ptr[2] = distance;
        }
    }
}

void NearestNeighborField::_initialize_field_from(const NearestNeighborField &other, int max_retry) {
    const auto &this_size = source_size();
    const auto &other_size = other.source_size();
    double fi = static_cast<double>(this_size.height) / other_size.height;
    double fj = static_cast<double>(this_size.width) / other_size.width;

    for (int i = 0; i < this_size.height; ++i) {
        for (int j = 0; j < this_size.width; ++j) {
            if (m_source.is_globally_masked(i, j)) continue;

            int ilow = static_cast<int>(std::min(i / fi, static_cast<double>(other_size.height - 1)));
            int jlow = static_cast<int>(std::min(j / fj, static_cast<double>(other_size.width - 1)));
            auto this_value = mutable_ptr(i, j);
            auto other_value = other.ptr(ilow, jlow);

            this_value[0] = static_cast<int>(other_value[0] * fi);
            this_value[1] = static_cast<int>(other_value[1] * fj);
            this_value[2] = _distance(i, j, this_value[0], this_value[1]);
        }
    }
    _randomize_field(max_retry, false);
}

void NearestNeighborField::minimize(int nr_pass) {
    const auto &this_size = source_size();
    while (nr_pass--) {
        for (int i = 0; i < this_size.height; ++i)
            for (int j = 0; j < this_size.width; ++j) {
                if (m_source.is_globally_masked(i, j)) continue;
                if (at(i, j, 2) > 0) _minimize_link(i, j, +1);
            }
        for (int i = this_size.height - 1; i >= 0; --i)
            for (int j = this_size.width - 1; j >= 0; --j) {
                if (m_source.is_globally_masked(i, j)) continue;
                if (at(i, j, 2) > 0) _minimize_link(i, j, -1);
            }
    }
}

void NearestNeighborField::_minimize_link(int y, int x, int direction) {
    const auto &this_size = source_size();
    const auto &this_target_size = target_size();
    auto this_ptr = mutable_ptr(y, x);

    // propagation along the y direction.
    if (y - direction >= 0 && y - direction < this_size.height && !m_source.is_globally_masked(y - direction, x)) {
        int yp = at(y - direction, x, 0) + direction;
        int xp = at(y - direction, x, 1);
        int dp = _distance(y, x, yp, xp);
        if (dp < at(y, x, 2)) {
            this_ptr[0] = yp, this_ptr[1] = xp, this_ptr[2] = dp;
        }
    }

    // propagation along the x direction.
    if (x - direction >= 0 && x - direction < this_size.width && !m_source.is_globally_masked(y, x - direction)) {
        int yp = at(y, x - direction, 0);
        int xp = at(y, x - direction, 1) + direction;
        int dp = _distance(y, x, yp, xp);
        if (dp < at(y, x, 2)) {
            this_ptr[0] = yp, this_ptr[1] = xp, this_ptr[2] = dp;
        }
    }

    // random search with a progressive step size.
    int random_scale = (std::min(this_target_size.height, this_target_size.width) - 1) / 2;
    while (random_scale > 0) {
        int yp = this_ptr[0] + (fast_rand() % (2 * random_scale + 1) - random_scale);
        int xp = this_ptr[1] + (fast_rand() % (2 * random_scale + 1) - random_scale);
        
        // Use std::clamp here, "using namespace std" handles the scope resolution
        yp = clamp(yp, 0, target_size().height - 1);
        xp = clamp(xp, 0, target_size().width - 1);

        if (m_target.is_globally_masked(yp, xp)) {
            random_scale /= 2;
        }

        int dp = _distance(y, x, yp, xp);
        if (dp < at(y, x, 2)) {
            this_ptr[0] = yp, this_ptr[1] = xp, this_ptr[2] = dp;
        }
        random_scale /= 2;
    }
}


// =========================================================================
// 3. Inpainting Class
// =========================================================================

class Inpainting {
public:
    Inpainting(cv::Mat image, cv::Mat mask, const PatchDistanceMetric *metric);
    Inpainting(cv::Mat image, cv::Mat mask, cv::Mat global_mask, const PatchDistanceMetric *metric);
    cv::Mat run(bool verbose = false, unsigned int random_seed = 1212);

private:
    void _initialize_pyramid(void);
    MaskedImage _expectation_maximization(MaskedImage source, MaskedImage target, int level, bool verbose);
    void _expectation_step(const NearestNeighborField &nnf, bool source2target, cv::Mat &vote, const MaskedImage &source, bool upscaled);
    void _maximization_step(MaskedImage &target, const cv::Mat &vote);

    // ORDER MUST MATCH INITIALIZATION LIST
    MaskedImage m_initial;
    std::vector<MaskedImage> m_pyramid;

    NearestNeighborField m_source2target;
    NearestNeighborField m_target2source;
    const PatchDistanceMetric *m_distance_metric;
};

// Inpainting Implementation
static std::vector<double> kDistance2Similarity;

void init_kDistance2Similarity() {
    if (!kDistance2Similarity.empty()) return;
    double base[11] = {1.0, 0.99, 0.96, 0.83, 0.38, 0.11, 0.02, 0.005, 0.0006, 0.0001, 0};
    int length = (PatchDistanceMetric::kDistanceScale + 1);
    kDistance2Similarity.resize(length);
    for (int i = 0; i < length; ++i) {
        double t = (double) i / length;
        int j = (int) (100 * t);
        int k = j + 1;
        double vj = (j < 11) ? base[j] : 0;
        double vk = (k < 11) ? base[k] : 0;
        kDistance2Similarity[i] = vj + (100 * t - j) * (vk - vj);
    }
}

inline void _weighted_copy(const MaskedImage &source, int ys, int xs, cv::Mat &target, int yt, int xt, double weight) {
    if (source.is_masked(ys, xs)) return;
    if (source.is_globally_masked(ys, xs)) return;

    auto source_ptr = source.get_image(ys, xs);
    auto target_ptr = target.ptr<double>(yt, xt);

#pragma unroll
    for (int c = 0; c < 3; ++c)
        target_ptr[c] += static_cast<double>(source_ptr[c]) * weight;
    target_ptr[3] += weight;
}

// Updated Constructor Order to match declaration: m_initial, m_pyramid, m_source2target, m_target2source, m_distance_metric
Inpainting::Inpainting(cv::Mat image, cv::Mat mask, const PatchDistanceMetric *metric)
    : m_initial(image, mask), m_pyramid(), m_source2target(), m_target2source(), m_distance_metric(metric) {
    _initialize_pyramid();
}

// Updated Constructor Order to match declaration
Inpainting::Inpainting(cv::Mat image, cv::Mat mask, cv::Mat global_mask, const PatchDistanceMetric *metric)
    : m_initial(image, mask, global_mask), m_pyramid(), m_source2target(), m_target2source(), m_distance_metric(metric) {
    _initialize_pyramid();
}

void Inpainting::_initialize_pyramid() {
    auto source = m_initial;
    m_pyramid.push_back(source);
    while (source.size().height > m_distance_metric->patch_size() && source.size().width > m_distance_metric->patch_size()) {
        source = source.downsample();
        m_pyramid.push_back(source);
    }
    init_kDistance2Similarity();
}

cv::Mat Inpainting::run(bool verbose, unsigned int random_seed) {
    fast_srand(random_seed);
    const int nr_levels = m_pyramid.size();

    MaskedImage source, target;
    for (int level = nr_levels - 1; level >= 0; --level) {
        if (verbose) std::cerr << "Inpainting level: " << level << std::endl;

        source = m_pyramid[level];

        if (level == nr_levels - 1) {
            target = source.clone();
            target.clear_mask();
            m_source2target = NearestNeighborField(source, target, m_distance_metric);
            m_target2source = NearestNeighborField(target, source, m_distance_metric);
        } else {
            m_source2target = NearestNeighborField(source, target, m_distance_metric, m_source2target);
            m_target2source = NearestNeighborField(target, source, m_distance_metric, m_target2source);
        }

        if (verbose) std::cerr << "Initialization done." << std::endl;
        target = _expectation_maximization(source, target, level, verbose);
    }
    return target.image();
}

MaskedImage Inpainting::_expectation_maximization(MaskedImage source, MaskedImage target, int level, bool verbose) {
    // const int nr_iters_em = 1 + 2 * level;
    // const int nr_iters_nnf = static_cast<int>(std::min(7, 1 + level));
    const int nr_iters_em = 1 + level;  // 減少外部循環次數
    const int nr_iters_nnf = 2;         // 限制 NNF 搜尋次數，原本可能高達 7 次
    const int patch_size = m_distance_metric->patch_size();

    MaskedImage new_source, new_target;

    for (int iter_em = 0; iter_em < nr_iters_em; ++iter_em) {
        if (iter_em != 0) {
            m_source2target.set_target(new_target);
            m_target2source.set_source(new_target);
            target = new_target;
        }

        if (verbose) std::cerr << "EM Iteration: " << iter_em << std::endl;

        auto size = source.size();
        for (int i = 0; i < size.height; ++i) {
            for (int j = 0; j < size.width; ++j) {
                if (!source.contains_mask(i, j, patch_size)) {
                    m_source2target.set_identity(i, j);
                    m_target2source.set_identity(i, j);
                }
            }
        }
        if (verbose) std::cerr << "  NNF minimization started." << std::endl;
        m_source2target.minimize(nr_iters_nnf);
        m_target2source.minimize(nr_iters_nnf);
        if (verbose) std::cerr << "  NNF minimization finished." << std::endl;

        bool upscaled = false;
        if (level >= 1 && iter_em == nr_iters_em - 1) {
            new_source = m_pyramid[level - 1];
            new_target = target.upsample(new_source.size().width, new_source.size().height, m_pyramid[level - 1].global_mask());
            upscaled = true;
        } else {
            new_source = m_pyramid[level];
            new_target = target.clone();
        }

        auto vote = cv::Mat(new_target.size(), CV_64FC4);
        vote.setTo(cv::Scalar::all(0));

        _expectation_step(m_source2target, 1, vote, new_source, upscaled);
        if (verbose) std::cerr << "  Expectation source to target finished." << std::endl;
        _expectation_step(m_target2source, 0, vote, new_source, upscaled);
        if (verbose) std::cerr << "  Expectation target to source finished." << std::endl;

        _maximization_step(new_target, vote);
        if (verbose) std::cerr << "  Minimization step finished." << std::endl;
    }
    return new_target;
}

void Inpainting::_expectation_step(
    const NearestNeighborField &nnf, bool source2target,
    cv::Mat &vote, const MaskedImage &source, bool upscaled
) {
    auto source_size = nnf.source_size();
    auto target_size = nnf.target_size();
    const int patch_size = m_distance_metric->patch_size();

    for (int i = 0; i < source_size.height; ++i) {
        for (int j = 0; j < source_size.width; ++j) {
            if (nnf.source().is_globally_masked(i, j)) continue;
            int yp = nnf.at(i, j, 0), xp = nnf.at(i, j, 1), dp = nnf.at(i, j, 2);
            double w = kDistance2Similarity[dp];

            for (int di = -patch_size; di <= patch_size; ++di) {
                for (int dj = -patch_size; dj <= patch_size; ++dj) {
                    int ys = i + di, xs = j + dj, yt = yp + di, xt = xp + dj;
                    if (!(ys >= 0 && ys < source_size.height && xs >= 0 && xs < source_size.width)) continue;
                    if (nnf.source().is_globally_masked(ys, xs)) continue;
                    if (!(yt >= 0 && yt < target_size.height && xt >= 0 && xt < target_size.width)) continue;
                    if (nnf.target().is_globally_masked(yt, xt)) continue;

                    if (!source2target) {
                        std::swap(ys, yt);
                        std::swap(xs, xt);
                    }

                    if (upscaled) {
                        for (int uy = 0; uy < 2; ++uy) {
                            for (int ux = 0; ux < 2; ++ux) {
                                _weighted_copy(source, 2 * ys + uy, 2 * xs + ux, vote, 2 * yt + uy, 2 * xt + ux, w);
                            }
                        }
                    } else {
                        _weighted_copy(source, ys, xs, vote, yt, xt, w);
                    }
                }
            }
        }
    }
}

void Inpainting::_maximization_step(MaskedImage &target, const cv::Mat &vote) {
    auto target_size = target.size();
    for (int i = 0; i < target_size.height; ++i) {
        for (int j = 0; j < target_size.width; ++j) {
            const double *source_ptr = vote.ptr<double>(i, j);
            unsigned char *target_ptr = target.get_mutable_image(i, j);

            if (target.is_globally_masked(i, j)) continue;

            if (source_ptr[3] > 0) {
                unsigned char r = cv::saturate_cast<unsigned char>(source_ptr[0] / source_ptr[3]);
                unsigned char g = cv::saturate_cast<unsigned char>(source_ptr[1] / source_ptr[3]);
                unsigned char b = cv::saturate_cast<unsigned char>(source_ptr[2] / source_ptr[3]);
                target_ptr[0] = r, target_ptr[1] = g, target_ptr[2] = b;
            } else {
                target.set_mask(i, j, 0);
            }
        }
    }
}


// =========================================================================
// 4. Main Entry Point for JS/Emscripten
// =========================================================================

Mat image_complete_js(Mat im_orig_in, Mat mask_in, int user_patch_size) {
    // 1. Prepare Input 
    // Emscripten/JS usually passes RGBA. The Inpainting Algorithm expects BGR.
    Mat im_orig;
    if (im_orig_in.channels() == 4) {
        cvtColor(im_orig_in, im_orig, COLOR_RGBA2BGR);
    } else {
        im_orig = im_orig_in.clone();
    }
    
    // Prepare Mask (Algorithm expects single channel, usually 0 or 255)
    Mat mask;
    if (mask_in.channels() > 1) {
        cvtColor(mask_in, mask, COLOR_RGBA2GRAY);
    } else {
        mask = mask_in.clone();
    }
    threshold(mask, mask, 127, 255, THRESH_BINARY);

    // 2. Setup Metric and Algorithm
    // Default to patch size 8 if user passes <= 0, otherwise use user value.
    int patch_size = (user_patch_size > 0) ? user_patch_size : 8;
    
    // Using standard SSD Metric
    PatchSSDDistanceMetric metric(patch_size);
    Inpainting inpainter(im_orig, mask, &metric);

    // 3. Run
    bool verbose = false; // Turn off for production/web
    unsigned int seed = 12345;
    Mat result_bgr = inpainter.run(verbose, seed);

    // 4. Convert back to RGBA for JS
    Mat resultRGBA;
    cvtColor(result_bgr, resultRGBA, COLOR_BGR2RGBA);
    
    return resultRGBA;
}

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("image_complete_js", &image_complete_js);
}