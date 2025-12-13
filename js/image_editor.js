const MODE={
    NOPE: 0,
    GrabCut: 1,
}

var image_editing_data={};

const image_editor_canvas_div = document.getElementById('image-editor-canvas-div');
const image_editor_canvas = document.getElementById('image-editor-canvas');
const image_editor_mask_canvas = document.getElementById('image-editor-mask-canvas');


image_editor_canvas_div.addEventListener('mousedown', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        console.log(pos);
    }
});
image_editor_canvas_div.addEventListener('mouseup', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        console.log(pos);
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