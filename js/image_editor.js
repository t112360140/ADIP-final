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

        if(mouseData.start){

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