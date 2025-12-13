const MODE={
    NOPE: 0,
    GrabCut: 1,
}

var image_editing_data={};

const image_editor_canvas = document.getElementById('image-editor-canvas');


image_editor_canvas.addEventListener('click', (event)=>{
    console.log(event);
});

function setEditImage(image, mode){
    if(!MODE[mode]) return;
    image_editing_data={
        img: imageClone(image),
        mode: MODE[mode],
    }

    cv.imshow(image_editor_canvas, image_editing_data.img);
}