const MODE={
    NOPE: 0,
    GrabCut: 1,
    GrabCutAuto: 2,
}

var image_editing_data={};

const image_editor_canvas_div = document.getElementById('image-editor-canvas-div');
const image_editor_canvas = document.getElementById('image-editor-canvas');
const image_editor_mask_canvas = document.getElementById('image-editor-mask-canvas');

let mouseData={};
image_editor_canvas_div.addEventListener('mousedown', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        mouseData.isDown=true;
        mouseData.start=pos;
        image_editor_mask_canvas.height=image_editor_canvas.height;
        image_editor_mask_canvas.width=image_editor_canvas.width;
    }
});
image_editor_canvas_div.addEventListener('mouseup', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y: event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        mouseData.isDown=false;
        mouseData.end=pos;
        const ctx=image_editor_mask_canvas.getContext('2d');
        ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);

        if(mouseData.start){
            const rect=new cv.Rect(
                Math.min(mouseData.end.x,mouseData.start.x),
                Math.min(mouseData.end.y,mouseData.start.y),
                Math.abs(mouseData.end.x-mouseData.start.x),
                Math.abs(mouseData.end.y-mouseData.start.y));
            switch(image_editing_data.mode){
                case MODE.GrabCut:
                    if(confirm('確認執行計算?')) doGrabCut(rect);
                    break;
            }
        }
    }
});
image_editor_canvas_div.addEventListener('mousemove', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        if(mouseData.isDown&&mouseData.start){
            const ctx=image_editor_mask_canvas.getContext('2d');
            ctx.strokeStyle='#ff0000';
            ctx.lineWidth=10;
            ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
            ctx.strokeRect(mouseData.start.x, mouseData.start.y, pos.x-mouseData.start.x, pos.y-mouseData.start.y);
        }
    }
}); 

function setEditImage(image, mode){
    if(!MODE[mode]) return;
    image_editing_data={
        img: imageClone(image),
        mode: MODE[mode],
    }

    cv.imshow(image_editor_canvas, image_editing_data.img.image);
    image_editor_mask_canvas.height=image_editor_canvas.height;
    image_editor_mask_canvas.width=image_editor_canvas.width;
}


function doGrabCut(rect, iterCount=5){
    if(image_editing_data.img){
        let src=image_editing_data.img.image.mat_clone();

        cv.resize(src, src, new cv.Size(512, 512*(src.rows/src.cols)), 0, 0, cv.INTER_AREA);
        let newSrc = new cv.Mat();
        src.convertTo(newSrc, -1, 1.2, 0); // alpha=1.2 (對比度增加 20%), beta=0
        src.delete();
        src = newSrc;

        cv.cvtColor(src, src, cv.COLOR_RGB2Lab);

        let mask = new cv.Mat();
        let bgdModel = new cv.Mat();
        let fgdModel = new cv.Mat();

        const scale=512/image_editing_data.img.image.cols;
        rect=new cv.Rect(
            rect.x*scale,
            rect.y*scale,
            rect.width*scale,
            rect.height*scale,
        );

        cv.grabCut(src, mask, rect, bgdModel, fgdModel, iterCount, cv.GC_INIT_WITH_RECT);

        cv.resize(mask, mask, new cv.Size(image_editing_data.img.image.cols, image_editing_data.img.image.rows), 0, 0, cv.INTER_NEAREST);
        cv.resize(bgdModel, bgdModel, new cv.Size(image_editing_data.img.image.cols, image_editing_data.img.image.rows), 0, 0, cv.INTER_NEAREST);
        cv.resize(fgdModel, fgdModel, new cv.Size(image_editing_data.img.image.cols, image_editing_data.img.image.rows), 0, 0, cv.INTER_NEAREST);

        let output = image_editing_data.img.image.mat_clone();

        let outData = output.data;
        let maskData = mask.data;
        const channels = output.channels();
        
        let alpha = 0.6;
        let beta = 1 - alpha;

        for (let i = 0; i < maskData.length; i++) {
            if (maskData[i] === 1 || maskData[i] === 3) {
                let imgIdx = i * channels;
                outData[imgIdx] = (outData[imgIdx] * beta) + (255 * alpha);
                outData[imgIdx + 1] = outData[imgIdx + 1] * beta;
                outData[imgIdx + 2] = outData[imgIdx + 2] * beta;
            }
        }

        cv.imshow(image_editor_canvas, output);

        src.delete();
        mask.delete();
        bgdModel.delete();
        fgdModel.delete();
        output.delete();
    }
}