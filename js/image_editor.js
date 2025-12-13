const MODE={
    NOPE: 0,
    GrabCut: 1,
}

var image_editing_data={};

const image_editor_canvas = document.getElementById('image-editor-canvas');
const image_editor_mask_canvas = document.getElementById('image-editor-mask-canvas');


image_editor_canvas.addEventListener('mousedown', (event)=>{
    console.log(event.offsetX, event.offsetY, image_editor_canvas.offsetHeight, image_editor_canvas.offsetWidth);
});
image_editor_canvas.addEventListener('mouseup', (event)=>{
    console.log(event.offsetX, event.offsetY, image_editor_canvas.offsetHeight, image_editor_canvas.offsetWidth);
});

function setEditImage(image, mode){
    if(!MODE[mode]) return;
    image_editing_data={
        img: imageClone(image),
        mode: MODE[mode],
    }

    cv.imshow(image_editor_canvas, image_editing_data.img.image);
}