importScripts('opencv.js');

(async()=>{
    cv = await cv;
    self.postMessage({ command: 'init'});
})();
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

            // const resultRGBA = inpaintFunction(cv, srcImage, maskImage, uuid);

            const kernelSize = 5;
            let tempMask = new cv.Mat();
            let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
            cv.dilate(maskImage, tempMask, kernel);
            kernel.delete();

            const resultRGBA = cv.image_complete_js(srcImage, tempMask, 10, 8, 8);  // user_iterations_unused, user_pm_iters, user_patch_w

            let maskInv = new cv.Mat();
            cv.bitwise_not(maskImage, maskInv);
            srcImage.copyTo(resultRGBA, maskInv);
            maskInv.delete();

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

            tempMask.delete();
            srcImage.delete();
            maskImage.delete();
            resultRGBA.delete();

        } catch (e) {
            console.error(e);
            self.postMessage({ command: 'error', uuid: uuid, error: e.toString() });
        }
    }
};