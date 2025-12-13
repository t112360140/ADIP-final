const MODE={
    NOPE: 0,
    GrabCut: 1,
}

var image_editing_data={};

function setEditImage(image, mode){
    if(!MODE[mode]) return;
    image_editing_data={
        img: imageClone(image),
        mode: mode,
    }

    cv.imshow(image_editor_canvas, image_editing_data.img);
}