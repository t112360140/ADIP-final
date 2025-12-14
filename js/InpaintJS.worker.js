importScripts('opencv.js');

let inited=false;
if(!inited) {
    self.postMessage({ command: 'init'});
    inited=true;
}
self.onmessage = function(event) {
    if (!cv) {
        self.postMessage({ command: 'error', error: 'OpenCV.js not initialized.' });
        return;
    }

    const { command, uuid, data } = event.data;

    if (command === 'inpaint') {
        try {
            const srcData = new Uint8Array(data.srcBuffer);
            const srcImage = new cv.matFromArray(data.src.rows, data.src.cols, data.src.type, srcData);

            const maskData = new Uint8Array(data.maskBuffer);
            const maskImage = new cv.matFromArray(data.mask.rows, data.mask.cols, data.mask.type, maskData);

            const resultRGBA = inpaintFunction(cv, srcImage, maskImage, uuid);

            let resultBuffer = resultRGBA.data.slice().buffer;
            const resultMetadata = {
                rows: resultRGBA.rows,
                cols: resultRGBA.cols,
                type: resultRGBA.type(),
                dataLength: resultRGBA.data.length
            };

            self.postMessage({
                command: 'inpaint-result',
                uuid: uuid,
                data: {
                    resultBuffer: resultBuffer,
                    resultMetadata: resultMetadata
                }
            }, [resultBuffer]);

            resultRGBA.delete();

        } catch (e) {
            console.error(e);
            self.postMessage({ command: 'error', uuid: uuid, error: e.toString() });
        }
    }
};


class InpaintJS {
    constructor(cv, src, mask) {
        this.cv = cv;
        this.PatchSize = 5;
        this.PryLevel = 6;
        this.MaxDis = 65535;

        if (src.type() !== cv.CV_8UC3) {
            throw new Error("Internal Source must be CV_8UC3");
        }
        if (mask.type() !== cv.CV_8UC1) {
            throw new Error("Internal Mask must be CV_8UC1");
        }

        this.srcImg = [];
        this.maskImg = [];
        this.maskedImage = [];
        // 【優化 1】移除 SourceToTarget，只保留 TargetToSource (Coherence)
        // PDF 來源: "我們嘗試了把 m_source2target 這個 NNF 相關的所有內容都刪除掉, 完全不影響結果的, 這樣速度基本上可以提高一半的" 
        this.offsetMap_TargetToSource = []; 
        
        // 1. 處理 Mask
        this.originMask = mask.mat_clone(); 
        let kernelSize = this.PatchSize; 
        let kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(kernelSize, kernelSize));
        this.cv.dilate(this.originMask, this.originMask, kernel);
        kernel.delete();
        let maskData = this.originMask.data;
        for (let i = 0; i < maskData.length; i++) {
            maskData[i] = (maskData[i] > 128) ? 1 : 0;
        }

        this.srcImg.push(src.mat_clone());
        this.maskImg.push(this.originMask);

        this.similarity = new Float32Array(this.MaxDis + 1);
        this.buildSimilarity();
    }

    buildSimilarity() {
        // PDF 來源: 原始的表後段全為 0 會導致像素權重無效 
        // 你的實作使用 exp 衰減是正確的，避免了此問題。
        const sigma = 5.0; 
        
        for (let i = 0; i < this.MaxDis + 1; i++) {
            let t = i; 
            let val = Math.exp(-t / sigma);
            this.similarity[i] = (val <= 1e-7) ? 1e-7 : val;
        }
    }

    buildPyr() {
        // 使用 OpenCV 實際尺寸，避免手動除法導致的奇偶數尺寸誤差 
        let currentSrc = this.srcImg[0];
        let level = 0;

        while (level < this.PryLevel) {
            let rows = currentSrc.rows;
            let cols = currentSrc.cols;
            
            if (rows <= this.PatchSize || cols <= this.PatchSize) break;

            let nextSrc = new this.cv.Mat();
            let nextMask = new this.cv.Mat();
            this.cv.pyrDown(currentSrc, nextSrc);
            this.cv.pyrDown(this.maskImg[level], nextMask); 
            
            let mData = nextMask.data;
            for(let k=0; k<mData.length; k++) {
                mData[k] = (mData[k] > 0) ? 1 : 0;
            }

            this.srcImg.push(nextSrc);
            this.maskImg.push(nextMask);
            
            currentSrc = nextSrc; // 更新指針，用於下一次循環判斷
            level++;
        }

        for (let i = 0; i < this.srcImg.length; i++) {
            let sz = this.srcImg[i].size();
            // 只初始化 TargetToSource
            this.offsetMap_TargetToSource.push(new this.cv.Mat(sz.height, sz.width, this.cv.CV_32FC3, new this.cv.Scalar(0, 0, 0)));
            
            this.maskedImage.push({
                img: this.srcImg[i],
                mask: this.maskImg[i],
                rows: sz.height,
                cols: sz.width
            });
        }
    }

    run(uuid) {
        this.buildPyr();

        let index = this.srcImg.length - 1;
        this.target = null; 

        for (; index >= 0; index--) {
            let srcObj = this.maskedImage[index];
            // 使用之前優化的：只保留 TargetToSource
            let offset_T2S = this.offsetMap_TargetToSource[index];

            postMessage({command: 'inpaint-status', uuid: uuid, data:{level: index, process: ((this.srcImg.length-1-index)/this.srcImg.length), size: [srcObj.cols, srcObj.rows]}});

            if (index === this.srcImg.length - 1) {
                // Top Level Initialization
                this.target = {
                    img: srcObj.img.mat_clone(),
                    mask: srcObj.mask.mat_clone(),
                    rows: srcObj.rows,
                    cols: srcObj.cols
                };
                
                this.initializeTargetHole(this.target, srcObj);
                this.target.mask.setTo(new this.cv.Scalar(0)); 

                // 隨機化
                this.randomizeOffsetMap(this.target, srcObj, offset_T2S, srcObj.mask);
            } else {
                // Upscale
                let prevTargetImg = this.target.img;
                let prevTargetMask = this.target.mask;
                
                this.target.img = new this.cv.Mat();
                this.cv.pyrUp(prevTargetImg, this.target.img, srcObj.img.size());
                prevTargetImg.delete();

                this.target.mask = new this.cv.Mat();
                this.cv.pyrUp(prevTargetMask, this.target.mask, srcObj.mask.size());
                prevTargetMask.delete();

                this.target.rows = srcObj.rows;
                this.target.cols = srcObj.cols;

                let prevOffset_T2S = this.offsetMap_TargetToSource[index + 1];
                this.initOffsetMap(this.target, srcObj, prevOffset_T2S, offset_T2S);
            }

            // EM 迭代
            this.expectationMaximization(srcObj, this.target, offset_T2S, index);
        }

        // --- 【核心修正】還原清晰背景 ---
        let result = this.target.img.mat_clone();
        
        // 獲取 Level 0 (原尺寸) 的數據
        let originalImg = this.srcImg[0];   // 原圖
        let originalMask = this.maskImg[0]; // 原始 Mask (1=洞, 0=背景)
        
        let resData = result.data;
        let orgData = originalImg.data;
        let mData = originalMask.data;
        let len = mData.length;

        // 遍歷所有像素
        for (let i = 0; i < len; i++) {
            // 如果 Mask 為 0 (背景)，則強制使用原圖像素，覆蓋掉 PatchMatch 計算出的模糊結果
            if (mData[i] === 0) {
                let idx = i * 3;
                resData[idx]     = orgData[idx];
                resData[idx + 1] = orgData[idx + 1];
                resData[idx + 2] = orgData[idx + 2];
            }
        }
        // ------------------------------------

        this.cleanUp();
        return result;
    }

    initializeTargetHole(target, srcObj) {
        let rows = target.rows;
        let cols = target.cols;
        let tData = target.img.data;
        let mData = srcObj.mask.data; 
        let sData = srcObj.img.data;

        let validPixels = [];
        for(let i=0; i<rows; i++) {
            for(let j=0; j<cols; j++) {
                if(mData[i*cols + j] === 0) {
                    validPixels.push((i*cols + j) * 3);
                }
            }
        }

        if(validPixels.length === 0) return; 

        for(let i=0; i<rows; i++) {
            for(let j=0; j<cols; j++) {
                if(mData[i*cols + j] === 1) {
                    let randIdx = validPixels[Math.floor(Math.random() * validPixels.length)];
                    let tIdx = (i*cols + j) * 3;
                    
                    tData[tIdx]     = sData[randIdx];
                    tData[tIdx + 1] = sData[randIdx + 1];
                    tData[tIdx + 2] = sData[randIdx + 2];
                }
            }
        }
    }

    randomizeOffsetMap(src, target, offset, rangeMask) {
        let rows = src.rows; 
        let cols = src.cols; 
        let offsetData = offset.data32F;
        
        let rangeRows = target.rows;
        let rangeCols = target.cols;
        let maskData = rangeMask.data; 

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                let idx = (i * cols + j) * 3;
                let r_row, r_col;
                let attempts = 0;
                
                do {
                    r_row = Math.floor(Math.random() * rangeRows);
                    r_col = Math.floor(Math.random() * rangeCols);
                    attempts++;
                } while (maskData[r_row * rangeCols + r_col] === 1 && attempts < 100);

                offsetData[idx] = r_row;
                offsetData[idx + 1] = r_col;
                offsetData[idx + 2] = this.MaxDis;
            }
        }
        this.initOffsetDis(src, target, offset);
    }

    initOffsetMap(src, target, preOff, offset) {
        let rows = src.rows;
        let cols = src.cols;
        let preRows = preOff.rows;
        let preCols = preOff.cols;
        
        let fx = rows / preRows;
        let fy = cols / preCols;
        if (fx < 1) fx = 2;
        if (fy < 1) fy = 2;

        let offsetData = offset.data32F;
        let preOffData = preOff.data32F;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                let xlow = Math.floor(i / fx);
                let ylow = Math.floor(j / fy);
                if (xlow >= preRows) xlow = preRows - 1;
                if (ylow >= preCols) ylow = preCols - 1;

                let preIdx = (xlow * preCols + ylow) * 3;
                let curIdx = (i * cols + j) * 3;

                offsetData[curIdx] = preOffData[preIdx] * fx;
                offsetData[curIdx + 1] = preOffData[preIdx + 1] * fy;
                offsetData[curIdx + 2] = this.MaxDis; 
            }
        }
        this.initOffsetDis(src, target, offset);
    }

    initOffsetDis(src, target, offset) {
        let rows = src.rows;
        let cols = src.cols;
        let offsetData = offset.data32F;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                let idx = (i * cols + j) * 3;
                let tx = offsetData[idx]; 
                let ty = offsetData[idx + 1];
                
                let dist = this.distance(src, i, j, target, Math.round(tx), Math.round(ty));
                offsetData[idx + 2] = dist;
            }
        }
    }

    distance(src, xs, ys, dst, xt, yt) {
        let halfP = Math.floor(this.PatchSize / 2);
        let dist = 0;
        let wsum = 0;
        let ssdmax = 255 * 255 * 9; 

        let sRows = src.rows, sCols = src.cols;
        let dRows = dst.rows, dCols = dst.cols;
        let sData = src.img.data;
        let sMask = src.mask.data;
        let dData = dst.img.data;
        let dMask = dst.mask.data;

        for (let dy = -halfP; dy <= halfP; dy++) {
            for (let dx = -halfP; dx <= halfP; dx++) {

                let xt_check = xt + dx; // Source X (注意你的變數命名，xt/xp 是指 Source)
                let yt_check = yt + dy; // Source Y

                if (xt_check < 0 || xt_check >= sRows || yt_check < 0 || yt_check >= sCols) return this.MaxDis; // 邊界檢查
                
                if (sMask[xt_check * sCols + yt_check] === 1) return this.MaxDis; // 核心約束：來源不能是破洞！

                let xks = xs + dx, yks = ys + dy;
                let xkt = xt + dx, ykt = yt + dy;

                if (xks < 1 || xks >= sRows - 1 || yks < 1 || yks >= sCols - 1) { dist += ssdmax; continue; }
                if (sMask[xks * sCols + yks] === 1) { dist += ssdmax; continue; }

                if (xkt < 1 || xkt >= dRows - 1 || ykt < 1 || ykt >= dCols - 1) { dist += ssdmax; continue; }
                if (dMask[xkt * dCols + ykt] === 1) { dist += ssdmax; continue; }
                
                wsum += ssdmax;

                let sIdx = (xks * sCols + yks) * 3;
                let tIdx = (xkt * dCols + ykt) * 3;

                // 1. RGB 顏色差異
                let rDiff = sData[sIdx] - dData[tIdx];
                let gDiff = sData[sIdx+1] - dData[tIdx+1];
                let bDiff = sData[sIdx+2] - dData[tIdx+2];
                let colorDist = rDiff*rDiff + gDiff*gDiff + bDiff*bDiff;

                // 2. 梯度差異 (依照 PDF 描述優化)
                // 使用 (Right - Left)/2 + 128 將梯度映射到 0-255
                
                // Source Gradient X
                let sIdxRight = ((xks + 1) * sCols + yks) * 3;
                let sIdxLeft  = ((xks - 1) * sCols + yks) * 3;
                let sGradX_R = Math.floor((sData[sIdxRight] - sData[sIdxLeft]) / 2) + 128;
                let sGradX_G = Math.floor((sData[sIdxRight+1] - sData[sIdxLeft+1]) / 2) + 128;
                let sGradX_B = Math.floor((sData[sIdxRight+2] - sData[sIdxLeft+2]) / 2) + 128;

                // Source Gradient Y
                let sIdxDown  = (xks * sCols + (yks + 1)) * 3;
                let sIdxUp    = (xks * sCols + (yks - 1)) * 3;
                let sGradY_R = Math.floor((sData[sIdxDown] - sData[sIdxUp]) / 2) + 128;
                let sGradY_G = Math.floor((sData[sIdxDown+1] - sData[sIdxUp+1]) / 2) + 128;
                let sGradY_B = Math.floor((sData[sIdxDown+2] - sData[sIdxUp+2]) / 2) + 128;

                // Target Gradient X
                let tIdxRight = ((xkt + 1) * dCols + ykt) * 3;
                let tIdxLeft  = ((xkt - 1) * dCols + ykt) * 3;
                let tGradX_R = Math.floor((dData[tIdxRight] - dData[tIdxLeft]) / 2) + 128;
                let tGradX_G = Math.floor((dData[tIdxRight+1] - dData[tIdxLeft+1]) / 2) + 128;
                let tGradX_B = Math.floor((dData[tIdxRight+2] - dData[tIdxLeft+2]) / 2) + 128;

                // Target Gradient Y
                let tIdxDown  = (xkt * dCols + (ykt + 1)) * 3;
                let tIdxUp    = (xkt * dCols + (ykt - 1)) * 3;
                let tGradY_R = Math.floor((dData[tIdxDown] - dData[tIdxUp]) / 2) + 128;
                let tGradY_G = Math.floor((dData[tIdxDown+1] - dData[tIdxUp+1]) / 2) + 128;
                let tGradY_B = Math.floor((dData[tIdxDown+2] - dData[tIdxUp+2]) / 2) + 128;

                // 計算梯度距離
                let gradDist = 
                    (sGradX_R - tGradX_R)**2 + (sGradX_G - tGradX_G)**2 + (sGradX_B - tGradX_B)**2 +
                    (sGradY_R - tGradY_R)**2 + (sGradY_G - tGradY_G)**2 + (sGradY_B - tGradY_B)**2;

                // 總距離 = 顏色 + 梯度 (權重 1:1)
                // dist += colorDist + gradDist;
                dist += colorDist + (5.0 * gradDist);
            }
        }
        
        if(wsum === 0) return this.MaxDis;
        return (this.MaxDis * dist / wsum);
    }

    expectationMaximization(src, target, offset_T2S, level) {
        let iterEM;
        if (level === 0) iterEM = 15;
        else iterEM = 3 + level;
        let iterNNF = Math.min(5, 1 + level);
        
        let newTargetImg = null;

        for (let i = 0; i < iterEM; i++) {
            let sRows = src.rows, sCols = src.cols;
            let offDataT = offset_T2S.data32F;
            let maskData = src.mask.data; 

            for (let j = 0; j < iterNNF; j++) {
                this.iteration(target, src, offset_T2S, j);
            }

            // --- 【修改開始】移除 Vote，改用 Best Match 重建圖片 ---
            
            // 1. 不需要 voteForTarget 了
            // this.voteForTarget(target, src, offset_T2S, false, vote, src);
            
            if (newTargetImg) newTargetImg.delete();
            newTargetImg = target.img.mat_clone(); 
            
            // 2. 直接使用 OffsetMap 重建影像
            this.reconstructFromOffset(newTargetImg, src.img, offset_T2S);

            target.img.delete();
            target.img = newTargetImg.mat_clone();
            // --- 【修改結束】 ---
        }
        if (newTargetImg) newTargetImg.delete();
    }

    // 【新增函式】根據 OffsetMap 直接複製像素 (消除模糊的關鍵)
    reconstructFromOffset(targetImg, sourceImg, offset) {
        let rows = targetImg.rows;
        let cols = targetImg.cols;
        let tData = targetImg.data;
        let sData = sourceImg.data;
        let offData = offset.data32F;
        let sCols = sourceImg.cols; // Source 的寬度

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                // 取得該像素在 OffsetMap 中指向的最佳匹配座標
                let offIdx = (i * cols + j) * 3;
                let xp = Math.round(offData[offIdx]);     // Source Row
                let yp = Math.round(offData[offIdx + 1]); // Source Col

                // 安全檢查 (防止越界)
                if (xp < 0) xp = 0; if (xp >= rows) xp = rows - 1;
                if (yp < 0) yp = 0; if (yp >= cols) yp = cols - 1;

                let tIdx = (i * cols + j) * 3;
                let sIdx = (xp * sCols + yp) * 3;

                // 直接複製 (Hard Assignment)
                tData[tIdx]     = sData[sIdx];
                tData[tIdx + 1] = sData[sIdx + 1];
                tData[tIdx + 2] = sData[sIdx + 2];
            }
        }
    }

    iteration(src, target, offset, iter) {
        let rows = src.rows, cols = src.cols;
        let offData = offset.data32F;
        let reverse = (iter % 2 !== 0);

        let startR = reverse ? rows - 1 : 0;
        let endR = reverse ? -1 : rows;
        let stepR = reverse ? -1 : 1;
        let startC = reverse ? cols - 1 : 0;
        let endC = reverse ? -1 : cols;
        let stepC = reverse ? -1 : 1;

        for (let r = startR; r !== endR; r += stepR) {
            for (let c = startC; c !== endC; c += stepC) {
                let idx = (r * cols + c) * 3;
                if (offData[idx + 2] > 0) {
                    this.propagation(src, target, offset, r, c, iter);
                    this.randomSearch(src, target, offset, r, c);
                }
            }
        }
    }

    propagation(src, target, offset, row, col, dir) {
        let offData = offset.data32F;
        let rows = src.rows, cols = src.cols;
        let currIdx = (row * cols + col) * 3;
        let dirVal = (dir % 2 === 0) ? -1 : 1;

        let nc = col - dirVal;
        if (nc >= 0 && nc < cols) {
            let nIdx = (row * cols + nc) * 3;
            let xp = offData[nIdx];
            let yp = offData[nIdx + 1] + dirVal; // 傳播：鄰居的對應點 + 1
            if (xp >= 0 && xp < target.rows && yp >= 0 && yp < target.cols) {
                let dp = this.distance(src, row, col, target, xp, yp);
                if (dp < offData[currIdx + 2]) {
                    offData[currIdx] = xp; offData[currIdx + 1] = yp; offData[currIdx + 2] = dp;
                }
            }
        }
        let nr = row - dirVal;
        if (nr >= 0 && nr < rows) {
            let nIdx = (nr * cols + col) * 3;
            let xp = offData[nIdx] + dirVal;
            let yp = offData[nIdx + 1];
            if (xp >= 0 && xp < target.rows && yp >= 0 && yp < target.cols) {
                let dp = this.distance(src, row, col, target, xp, yp);
                if (dp < offData[currIdx + 2]) {
                    offData[currIdx] = xp; offData[currIdx + 1] = yp; offData[currIdx + 2] = dp;
                }
            }
        }
    }

    randomSearch(src, target, offset, row, col) {
        let w = Math.max(src.cols, src.rows);
        let offData = offset.data32F;
        let idx = (row * src.cols + col) * 3;

        // PDF 提到：隨機搜索以「原始中心點」(即 row, col) 為基準效果較好 [cite: 240, 241]
        // 這裡保持原邏輯不變，因為這就是 Original Center 策略
        while (w > 0) {
            let x = Math.floor(row + (Math.random() * 2 * w) - w);
            let y = Math.floor(col + (Math.random() * 2 * w) - w);
            x = Math.max(0, Math.min(target.rows - 1, x));
            y = Math.max(0, Math.min(target.cols - 1, y));

            let d = this.distance(src, row, col, target, x, y);
            if (d < offData[idx + 2]) {
                offData[idx] = x; offData[idx + 1] = y; offData[idx + 2] = d;
            }
            w = Math.floor(w / 2);
        }
    }

    voteForTarget(src, tar, offset, sourceToTarget, vote, newsrc) {
        // 因為我們只做 TargetToSource，這裡的參數 sourceToTarget 永遠為 false
        // src 是 Target, tar 是 Source
        let rows = src.rows, cols = src.cols; // Target rows/cols
        let offData = offset.data32F;
        let voteData = vote.data32F; 
        let srcImgData = newsrc.img.data; // 實際上是 Source Image Data
        let halfP = Math.floor(this.PatchSize / 2);

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                let offIdx = (i * cols + j) * 3;
                let xp = Math.round(offData[offIdx]); // Source X
                let yp = Math.round(offData[offIdx + 1]); // Source Y
                let dp = Math.round(offData[offIdx + 2]);
                
                if (dp > this.MaxDis) dp = this.MaxDis;
                let w = this.similarity[dp];

                if (w <= 1e-7) continue; // 忽略極小權重

                // 簡單的像素複製投票 (Target[i,j] 應該像 Source[xp, yp])
                // 對於 TargetToSource，Offset 存的是：Target(i,j) 最佳匹配是 Source(xp, yp)
                // 我們直接把 Source(xp, yp) 的顏色貢獻給 Vote(i, j)
                
                let votePxIdx = (i * cols + j) * 4;
                // 注意：這裡直接取中心像素即可，不需要再遍歷 Patch，速度更快
                // 如果需要更高質量（如 PDF 提到的完整加權），則保留 Patch 循環
                // 這裡保留你的原始 Patch 循環邏輯，確保質量
                
                for (let dx = -halfP; dx <= halfP; dx++) {
                    for (let dy = -halfP; dy <= halfP; dy++) {
                        // 當 sourceToTarget = false 時:
                        // i,j 是 Target 的坐標
                        // xp,yp 是 Source 的坐標
                        // 我們認為 Target(i+dx, j+dy) 應該類似於 Source(xp+dx, yp+dy)
                        
                        let xt = i + dx; 
                        let yt = j + dy;
                        let xs = xp + dx; 
                        let ys = yp + dy;

                        if (xs < 0 || xs >= newsrc.rows || ys < 0 || ys >= newsrc.cols) continue;
                        if (xt < 0 || xt >= rows || yt < 0 || yt >= cols) continue;

                        let srcPxIdx = (xs * newsrc.cols + ys) * 3;
                        let targetVoteIdx = (xt * cols + yt) * 4;

                        voteData[targetVoteIdx] += w * srcImgData[srcPxIdx];      
                        voteData[targetVoteIdx + 1] += w * srcImgData[srcPxIdx + 1]; 
                        voteData[targetVoteIdx + 2] += w * srcImgData[srcPxIdx + 2]; 
                        voteData[targetVoteIdx + 3] += w;      
                    }
                }
            }
        }
    }

    formTargetImg(targetMat, maskMat, vote) {
        let rows = targetMat.rows;
        let cols = targetMat.cols;
        let tData = targetMat.data;
        let vData = vote.data32F;
        let mData = maskMat.data;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                // 優化：只對 Mask 區域（破洞）進行重構，非破洞區域保持原樣（雖然你前面已經填了背景，但這樣更保險）
                // 不過為了融合自然，通常全圖更新也可以。
                
                let vIdx = (i * cols + j) * 4;
                let wSum = vData[vIdx + 3];

                if (wSum > 0) {
                    let idx = (i * cols + j) * 3;
                    tData[idx] = Math.round(vData[vIdx] / wSum);
                    tData[idx + 1] = Math.round(vData[vIdx + 1] / wSum);
                    tData[idx + 2] = Math.round(vData[vIdx + 2] / wSum);
                }
            }
        }
    }

    cleanUp() {
        this.srcImg.forEach(m => m.delete());
        this.maskImg.forEach(m => m.delete());
        // this.offsetMap_SourceToTarget.forEach(m => m.delete()); // 已移除
        this.offsetMap_TargetToSource.forEach(m => m.delete());
        if(this.target && this.target.img) this.target.img.delete();
        if(this.target && this.target.mask) this.target.mask.delete();
    }
}

/**
 * Main Function to call from outside
 * @param {object} cv - The OpenCV.js instance
 * @param {cv.Mat} srcImage - Source image (CV_8UC4)
 * @param {cv.Mat} maskImage - Mask image (CV_8UC1, 255 = remove)
 * @returns {cv.Mat} Inpainted image (CV_8UC4)
 */
function inpaintFunction(cv, srcImage, maskImage, uuid) {
    if (srcImage.type() !== cv.CV_8UC4) {
        console.error("Input source must be CV_8UC4 (RGBA)");
        return srcImage.mat_clone();
    }
    
    // 1. Convert RGBA to RGB (CV_8UC3) for the algorithm
    let srcRGB = new cv.Mat();
    cv.cvtColor(srcImage, srcRGB, cv.COLOR_RGBA2RGB);
    let srcLab = new cv.Mat();
    cv.cvtColor(srcRGB, srcLab, cv.COLOR_RGB2Lab);

    // 2. Run Inpaint Logic
    let inpainter = new InpaintJS(cv, srcLab, maskImage);
    let resultLab = inpainter.run(uuid);

    // 3. Convert Result RGB back to RGBA
    let resultRGB = new cv.Mat();
    cv.cvtColor(resultLab, resultRGB, cv.COLOR_Lab2RGB);
    let resultRGBA = new cv.Mat();
    cv.cvtColor(resultRGB, resultRGBA, cv.COLOR_RGB2RGBA);

    // 4. Handle Alpha Channel
    // The inpainted area likely has undefined alpha or 255.
    // Usually, we want the result to be fully opaque (255).
    // Let's force alpha to 255 for the whole image to be safe, 
    // or preserve original alpha where mask was 0.
    // Simplest approach: Set all Alpha to 255.
    let channels = new cv.MatVector();
    cv.split(resultRGBA, channels);
    let alpha = channels.get(3);
    alpha.setTo(new cv.Scalar(255));
    cv.merge(channels, resultRGBA);

    // Clean up temporary mats
    srcRGB.delete();
    srcLab.delete();
    resultLab.delete();
    resultRGB.delete();
    channels.delete();
    alpha.delete();

    return resultRGBA;
}