const MODE={
    NOPE: 0,
    GrabCut: 1,
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
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        mouseData.isDown=false;
        mouseData.end=pos;
        const ctx=image_editor_mask_canvas.getContext('2d');
        ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);

        if(mouseData.start){
            const rect=new cv.Rect(mouseData.start.x, mouseData.start.y, mouseData.end.x, mouseData.end.y);

            if(image_editing_data.mode=MODE.GrabCut){
                doGrabCut(rect);
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


function doGrabCut(rect, iterCount=2){
    if(image_editing_data.img){
        const src=image_editing_data.img.image;
        let mask = new cv.Mat();
        let bgdModel = new cv.Mat();
        let fgdModel = new cv.Mat();

        cv.grabCut(src, mask, rect, bgdModel, fgdModel, iterCount, cv.GC_INIT_WITH_RECT);

        let output = src.mat_clone();

        let outData = output.data;
        let maskData = mask.data;
        
        let alpha = 0.6;
        let beta = 1 - alpha;

        for (let i = 0; i < maskData.length; i++) {
            if (maskData[i] === 1 || maskData[i] === 3) {
                let imgIdx = i * 4;
                outData[imgIdx] = (outData[imgIdx] * beta) + (255 * alpha);
                outData[imgIdx + 1] = outData[imgIdx + 1] * beta;
                outData[imgIdx + 2] = outData[imgIdx + 2] * beta;
            }
        }

        cv.imshow(image_editor_canvas, output);

        mask.delete();
        bgdModel.delete();
        fgdModel.delete();
        output.delete();
    }
}