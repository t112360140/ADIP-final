var set2Width=-1;
var GrabCutIterCount=2;


const MODE={
    NOPE: 0,
    GrabCut: 11,
    GrabCutPen: 21,
    GrabCutPeople: 31,
    GrabCutAuto: 41,

    Merge: 12,
    MergeSingle: 22,

    PhotoFix: 13,
    PhotoFixWhite: 23,

    View: 91,
}

var image_editing_data={};

const image_editor_canvas_div = document.getElementById('image-editor-canvas-div');
const image_editor_canvas = document.getElementById('image-editor-canvas');
const image_editor_mask_canvas = document.getElementById('image-editor-mask-canvas');

var penWidth=5;
function updatePenWidth(width=5){
    penWidth=width;
    let classList=document.getElementsByClassName('pen-width');
    for(let i=0;i<classList.length;i++){
        classList[i].value=penWidth;
    }
}

let mouseData={};
image_editor_canvas_div.addEventListener('mousedown', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        mouseData.isDown=true;
        mouseData.start=pos;
        if(image_editor_mask_canvas.height!=image_editor_canvas.height||image_editor_mask_canvas.width!=image_editor_canvas.width){
            image_editor_mask_canvas.height=image_editor_canvas.height;
            image_editor_mask_canvas.width=image_editor_canvas.width;
        }
        // const ctx=image_editor_mask_canvas.getContext('2d');
        // ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
    }else if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=image_editing_data.select&&image_editing_data.select<image_editing_data.layer.length){
            const pos={
                x: event.offsetX*(image_editing_data.width/image_editor_canvas_div.offsetWidth),
                y:event.offsetY*(image_editing_data.height/image_editor_canvas_div.offsetHeight),
            };
            mouseData.isDown=true;
            mouseData.start=pos;
        }
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
                case MODE.GrabCutPen:
                case MODE.GrabCutPeople:
                case MODE.GrabCutAuto:
                    if(!image_editing_data.grabCutFirst||image_editing_data.grabCutAdd!=0){
                        if(confirm('確認執行計算?')) doGrabCut(rect, GrabCutIterCount);
                    }
                    break;
                case MODE.PhotoFix:
                    let mask = new cv.Mat(image_editing_data.img.image.rows, image_editing_data.img.image.cols, cv.CV_8UC4, new cv.Scalar(255, 0, 0, 0));
                    for(let i=0;i<image_editing_data.mask.data.length;i++){
                        if(image_editing_data.mask.data[i]==255)
                            mask.data[i*4+3]=128;
                    }
                    cv.imshow(image_editor_mask_canvas, mask);
                    mask.delete();
                    break;
            }
        }
    }else if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(mouseData.isDown&&mouseData.start&&0<=image_editing_data.select&&image_editing_data.select<image_editing_data.layer.length){
            const pos={
                x: event.offsetX*(image_editing_data.width/image_editor_canvas_div.offsetWidth),
                y:event.offsetY*(image_editing_data.height/image_editor_canvas_div.offsetHeight),
            };

            const data=image_editing_data.adjust[image_editing_data.select];
            data.x-=mouseData.start.x-pos.x;
            data.y-=mouseData.start.y-pos.y;
            
            drawMergeImage();
        }
    }
    mouseData.isDown=false;
});
image_editor_canvas_div.addEventListener('mousemove', (event)=>{
    if(image_editing_data.img){
        const pos={
            x: event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth),
            y:event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight),
        };
        if(mouseData.isDown&&mouseData.start){
            switch(image_editing_data.mode){
                case MODE.GrabCut:
                case MODE.GrabCutPen:
                case MODE.GrabCutPeople:
                case MODE.GrabCutAuto:
                    if(!image_editing_data.grabCutFirst){
                        const ctx=image_editor_mask_canvas.getContext('2d');
                        ctx.strokeStyle='#ff0000';
                        ctx.lineWidth=10;
                        ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
                        ctx.strokeRect(mouseData.start.x, mouseData.start.y, pos.x-mouseData.start.x, pos.y-mouseData.start.y);
                    }else if(image_editing_data.grabCutAdd!=0){
                        const ctx=image_editor_mask_canvas.getContext('2d');
                        ctx.fillStyle='#ff0000';
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, penWidth, 0, Math.PI * 2, true);
                        ctx.fill();
                        addGrabCut(pos, penWidth);
                    }
                    break;
                case MODE.PhotoFix:
                    const ctx=image_editor_mask_canvas.getContext('2d');
                    ctx.fillStyle='#ff0000';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, penWidth, 0, Math.PI * 2, true);
                    ctx.fill();
                    cv.circle(image_editing_data.mask, new cv.Point(pos.x, pos.y), penWidth, new cv.Scalar(255), -1);
                    break;
            }
        }
    }else if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(mouseData.isDown&&mouseData.start&&0<=image_editing_data.select&&image_editing_data.select<image_editing_data.layer.length){
            const pos={
                x: event.offsetX*(image_editing_data.width/image_editor_canvas_div.offsetWidth),
                y:event.offsetY*(image_editing_data.height/image_editor_canvas_div.offsetHeight),
            };

            const data=image_editing_data.adjust[image_editing_data.select];
            data.x-=mouseData.start.x-pos.x;
            data.y-=mouseData.start.y-pos.y;
            
            drawMergeImage();
            mouseData.start=pos;
        }
    }
});
image_editor_canvas_div.addEventListener('wheel', (event)=>{
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=image_editing_data.select&&image_editing_data.select<image_editing_data.layer.length&&
            !image_editing_data.adjust[image_editing_data.select].base
        ){
            if(event.deltaY>0) resizeMergeImage(image_editing_data.select, 0.9, (event.ctrlKey*1+event.shiftKey*2)||3);
            else resizeMergeImage(image_editing_data.select, 1.1, (event.ctrlKey*1+event.shiftKey*2)||3);
            event.preventDefault();
        }
    }
}); 


const editMenu={
    GrabCut: document.getElementById('GrabCut-menu'),
    Merge: document.getElementById('Merge-menu'),
    PhotoFix: document.getElementById('PhotoFix-menu'),
};
function setEditImage(image, mode, config={}){
    if(MODE[mode]==null){
        console.warn(`Mode: ${mode} not exist!`);
        return;
    }

    if(MODE[mode]===MODE.NOPE){
        let ctx=image_editor_canvas.getContext('2d');
        ctx.clearRect(0, 0, image_editor_canvas.width, image_editor_canvas.height);
        ctx=image_editor_mask_canvas.getContext('2d');
        ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
        deepImageRemove(image_editing_data);
        image_editing_data={};
        for(const key in editMenu) editMenu[key].style.display='none';
        return;
    }

    if(image_editing_data.mode==MODE.Merge&&MODE[mode]%10!=2){
        deepImageRemove(image_editing_data);
        image_editing_data={};
    }

    switch(MODE[mode]%10){
        case 1:
            deepImageRemove(image_editing_data);
            image_editing_data={
                img: imageClone(image),
                mode: MODE[mode],

                mask: null,
                bgdModel: null,
                fgdModel: null,
                grabCutFirst:false,
                grabCutAdd: 0,
            };
            break;
        case 2:
            if(image_editing_data.mode!=MODE.Merge){
                deepImageRemove(image_editing_data);
                image_editing_data={
                    mode: MODE.Merge,

                    layer:[],
                    adjust:[],
                    select: -1,
                    height:0,
                    width:0,
                };
            }
            break;
        case 3:
            deepImageRemove(image_editing_data);
            image_editing_data={
                img: imageClone(image),
                mode: MODE[mode],

                mask: null,
                penW: 3,
            };
            break;
        case 9:
            deepImageRemove(image_editing_data);
            image_editing_data={
                img: imageClone(image),
                mode: MODE[mode],
            };
            break;
    }

    if(!config.dontDraw){
        if(MODE[mode]%10!==2) cv.imshow(image_editor_canvas, image_editing_data.img.image);
        image_editor_mask_canvas.height=image_editor_canvas.height;
        image_editor_mask_canvas.width=image_editor_canvas.width;
    }

    for(const key in editMenu) editMenu[key].style.display='none';
    switch(MODE[mode]){
        case MODE.GrabCutPeople:
            editMenu.GrabCut.style.display='block';
            if(confirm('確定計算?')){
                doGrabCutWithFace();
                opencv_info.innerHTML='人物選取';
            }
            break;
        case MODE.GrabCutAuto:
            editMenu.GrabCut.style.display='block';
            if(confirm('確定計算?')){
                doGrabCut(new cv.Rect(10, 10, image.width-20, image.height-20), GrabCutIterCount);
                opencv_info.innerHTML='自動選取';
                break;
            }
        case MODE.GrabCut:
            {
                editMenu.GrabCut.style.display='block';
                const scale=set2Width>0?set2Width/image_editing_data.img.image.cols:1;
                image_editing_data.mask = new cv.Mat(
                    image_editing_data.img.image.rows*scale,
                    image_editing_data.img.image.cols*scale,
                    cv.CV_8UC1,
                    new cv.Scalar(cv.GC_PR_BGD)
                );
                opencv_info.innerHTML='選擇一個區塊來計算物件';
            }
            break;
        case MODE.GrabCutPen:
            {
                editMenu.GrabCut.style.display='block';
                image_editing_data.grabCutFirst=true;
                image_editing_data.grabCutAdd=1;
                const scale=set2Width>0?set2Width/image_editing_data.img.image.cols:1;
                image_editing_data.mask = new cv.Mat(
                    image_editing_data.img.image.rows*scale,
                    image_editing_data.img.image.cols*scale,
                    cv.CV_8UC1,
                    new cv.Scalar(cv.GC_PR_BGD)
                );
                opencv_info.innerHTML='標記想要添加的部分';
            }
            break;

        case MODE.Merge:
            editMenu.Merge.style.display='block';
            const findData=findUUID(image.uuid);
            if(findData.child.length>0){
                let fixed=[];
                for(let i=0;i<findData.child.length;i++){
                    if(findData.child[i].data.type==TYPE.FIXED) fixed.push({index: i, data: findData.child[i].data});
                }
                if(fixed.length>0&&confirm("找到修復過得影像，是否使用?\n"+fixed[0].data.name)){
                    if(fixed.length>1){
                        const ret=parseInt(prompt(`找到多個修復影像，請選擇要使用的:\n${fixed.map((v, i)=>((i+1).toString()+': '+v.data.uuid)).join('\n')}`));
                        if(1<=ret&&ret<=fixed.length){
                            setEditImage(fixed[ret-1].data, 'Merge');
                            break;
                        }else{
                            alert('輸入錯誤，使用第一個');
                            setEditImage(fixed[0].data, 'Merge');
                            break;
                        }
                    }
                    setEditImage(fixed[0].data, 'Merge');
                    break;
                }
                if(confirm("是否載入分解過的影像?\n"+image.name)){
                    let backIndex=[];
                    for(let i=0;i<findData.child.length;i++){
                        if(findData.child[i].data.type==TYPE.BACKGROUND) backIndex.push({index:i, uuid: findData.child[i].data.sibling});
                    }
                    let index=0;
                    if(backIndex.length>1){
                        const ret=parseInt(prompt(`找到多組子背景，請選擇要使用的:\n${backIndex.map((v, i)=>((i+1).toString()+': '+v.uuid)).join('\n')}`));
                        if(1<=ret&&ret<=backIndex.length){
                            index=ret-1;
                        }else{
                            index=-1;
                        }
                    }
                    if(index>=0&&backIndex.length>0){
                        const findBackData=findUUID(backIndex[index].uuid);
                        let objectDate=null;
                        for(let i=0;i<findBackData.sibling.length;i++){
                            if(findBackData.sibling[i].data.type==TYPE.OBJECT){
                                objectDate={index: i, data:findBackData.sibling[i].data};
                                break;
                            }
                        }
                        if(objectDate!=null&&confirm("是否順便載入此背景的前景元素?\n"+image.name)){
                            setEditImage(findData.child[backIndex[index].index].data, 'Merge', {dontDraw:true});
                            setEditImage(objectDate.data, 'Merge', {dontDraw:true});
                        }else{
                            if(confirm("找不到前景元素。\n只使用背景元素?\n"+image.name)){
                                setEditImage(findData.child[backIndex[index].index].data, 'MergeSingle');
                            }else{
                                setEditImage(image, 'MergeSingle');
                            }
                        }
                    }else{
                        alert('找不到背景影像，直接載入原始圖片');
                        setEditImage(image, 'MergeSingle');
                    }
                }else{
                    setEditImage(image, 'MergeSingle');
                }
            }else{
                setEditImage(image, 'MergeSingle');
            }
            break;
        case MODE.MergeSingle:
            editMenu.Merge.style.display='block';
            const data=imageClone(image);
            if(image_editing_data.layer.length<=0){
                image_editing_data.height=data.height;
                image_editing_data.width=data.width;
            }
            let base=null;
            for(let i=0;i<image_editing_data.adjust.length;i++){
                if(image_editing_data.adjust[i].base) base=image_editing_data.adjust[i];
                break;
            }
            const scale_=Math.min(base?Math.min(base.w/image.width, base.h/image.height, 1):1, 1);
            image_editing_data.layer.push(data);
            image_editing_data.adjust.push({
                x: 0, y: 0,
                w: Math.floor(image.width*scale_), h: Math.floor(image.height*scale_),
                base: (base==null),
            });
            if(!config.dontDraw){
                updateMergeLayerSelect(image.uuid);
                drawMergeImage();
            }
            break;
            
        case MODE.PhotoFix:
            editMenu.PhotoFix.style.display='block'
            image_editing_data.mask = new cv.Mat(
                image_editing_data.img.image.rows,
                image_editing_data.img.image.cols,
                cv.CV_8UC1,
                new cv.Scalar(0)
            );
            opencv_info.innerHTML='標記想要修補的部分';
            break;
        case MODE.PhotoFixWhite:
            editMenu.PhotoFix.style.display='block'
            image_editing_data.mask = new cv.Mat(
                image_editing_data.img.image.rows,
                image_editing_data.img.image.cols,
                cv.CV_8UC1,
                new cv.Scalar(0)
            );
            opencv_info.innerHTML='修補影像';
            if(confirm('確認修補影像?')){
                for(let i=0;i<image_editing_data.mask.data.length;i++){
                    if(image_editing_data.img.image.data[i*4]>250&&
                        image_editing_data.img.image.data[i*4+1]>250&&
                        image_editing_data.img.image.data[i*4+2]>250){
                        image_editing_data.mask.data[i]=255;
                    }
                }
                fixImage();
            }
            image_editing_data.mode=MODE.PhotoFix;
            opencv_info.innerHTML='標記想要修補的部分';
            break;
    }
}

async function createFileFromUrl(path, url) {
    const req=await fetch(url);
    if(req.ok){
        let data = new Uint8Array(await req.arrayBuffer());
        cv.FS_createDataFile('/', path, data, true, false, false);
    }else{
        console.error("Fetch Filed!");
        return;
    }
};

let xmlGet=false;
async function findFaceInImage(image){
    if(!xmlGet){
        await createFileFromUrl('haarcascade_frontalface_default.xml', 'xml/haarcascade_frontalface_default.xml');
        xmlGet=true;
    }
    let facesPos=[];

    let src = image.mat_clone();
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    let faces = new cv.RectVector();
    let faceCascade = new cv.CascadeClassifier();
    faceCascade.load('haarcascade_frontalface_default.xml');
    let msize = new cv.Size(0, 0);
    faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);
    for (let i = 0; i < faces.size();i++) {
        let h=faces.get(i).height;
        let w=faces.get(i).width;
        let x=faces.get(i).x;
        let y=faces.get(i).y;

        facesPos.push({
            x:x,y:y,
            h:h,w:w,
        });
    }
    src.delete();
    gray.delete();
    faceCascade.delete();
    faces.delete();

    return facesPos;
}

async function doGrabCutWithFace(){
    if(image_editing_data.img){
        let facesPos = await findFaceInImage(image_editing_data.img.image);
        for(let i=0;i<facesPos.length;i++){
            facesPos[i].x=Math.max(facesPos[i].x-facesPos[i].w, 1);
            facesPos[i].y=Math.floor(Math.max(facesPos[i].y-facesPos[i].h/2, 1));
            facesPos[i].w=Math.min(facesPos[i].w*3, image_editing_data.img.image.cols-facesPos[i].x-1);
            facesPos[i].h=Math.min(facesPos[i].h*10, image_editing_data.img.image.rows-facesPos[i].y-1);
        }

        image_editing_data.grabCutFirst=true;
        const scale=set2Width>0?set2Width/image_editing_data.img.image.cols:1;
        image_editing_data.mask = new cv.Mat(
            image_editing_data.img.image.rows*scale,
            image_editing_data.img.image.cols*scale,
            cv.CV_8UC1,
            new cv.Scalar(cv.GC_PR_BGD)
        );

        for(let i=0;i<facesPos.length;i++){
            cv.rectangle(
                image_editing_data.mask,
                new cv.Point(facesPos[i].x, facesPos[i].y),
                new cv.Point(facesPos[i].x+facesPos[i].w, facesPos[i].y+facesPos[i].h),
                new cv.Scalar(cv.GC_PR_FGD), -1
            );
        }

        doGrabCut(null, GrabCutIterCount);

        const ctx=image_editor_mask_canvas.getContext('2d');
        ctx.strokeStyle='#0000ff';
        ctx.lineWidth=3;
        for(let i=0;i<facesPos.length;i++){
            ctx.strokeRect(facesPos[i].x, facesPos[i].y, facesPos[i].w, facesPos[i].h);
        }
    }
}

function doGrabCut(rect, iterCount=2){
    if(image_editing_data.img){
        let src=image_editing_data.img.image.mat_clone();

        let mode=cv.GC_INIT_WITH_RECT;
        if(!image_editing_data.grabCutFirst){
            if(!rect) return;

            if(image_editing_data.mask instanceof cv.Mat) image_editing_data.mask.delete();
            if(image_editing_data.bgdModel instanceof cv.Mat) image_editing_data.bgdModel.delete();
            if(image_editing_data.fgdModel instanceof cv.Mat) image_editing_data.fgdModel.delete();
            image_editing_data.mask = new cv.Mat();
            image_editing_data.bgdModel = new cv.Mat();
            image_editing_data.fgdModel = new cv.Mat();

            if(set2Width>0){
                const scale=set2Width/image_editing_data.img.image.cols;
                rect=new cv.Rect(
                    rect.x*scale,
                    rect.y*scale,
                    rect.width*scale,
                    rect.height*scale,
                );
            }
            mode=cv.GC_INIT_WITH_RECT;
        }else{
            rect = new cv.Rect();
            if(!(image_editing_data.mask instanceof cv.Mat)) image_editing_data.mask = new cv.Mat();
            if(!(image_editing_data.bgdModel instanceof cv.Mat)) image_editing_data.bgdModel = new cv.Mat();
            if(!(image_editing_data.fgdModel instanceof cv.Mat)) image_editing_data.fgdModel = new cv.Mat();
            mode=cv.GC_INIT_WITH_MASK;
        }
        image_editing_data.grabCutFirst=true;

        if(set2Width>0) cv.resize(src, src, new cv.Size(set2Width, set2Width*(src.rows/src.cols)), 0, 0, cv.INTER_AREA);
        let newSrc = new cv.Mat();
        src.convertTo(newSrc, -1, 1.2, 0); // alpha=1.2 (對比度增加 20%), beta=0
        src.delete();
        src = newSrc;

        cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
        cv.cvtColor(src, src, cv.COLOR_RGB2Lab);

        try {
            cv.grabCut(src, image_editing_data.mask, rect, image_editing_data.bgdModel, image_editing_data.fgdModel, iterCount, mode);
        } catch (err) {
            console.error("GrabCut Error:", err);
            src.delete();
            alert("異常錯誤");
            return;
        }


        let output = image_editing_data.img.image.mat_clone();
        let outputMask = image_editing_data.mask.mat_clone();
        cv.resize(outputMask, outputMask, new cv.Size(output.cols, output.rows), 0, 0, cv.INTER_NEAREST);

        cv.imshow(image_editor_canvas, output);

        let outData = output.data;
        let maskData = outputMask.data;

        for (let i = 0; i < maskData.length; i++) {
            outData[i*4 + 0] = 255;
            outData[i*4 + 1] = 0;
            outData[i*4 + 2] = 0;
            if (maskData[i] === cv.GC_FGD || maskData[i] === cv.GC_PR_FGD) {
                outData[i*4 + 3] = 128;
            }else{
                outData[i*4 + 3] = 0;
            }
        }

        cv.imshow(image_editor_mask_canvas, output);

        src.delete();
        output.delete();
        outputMask.delete();
    }
}

function addGrabCut(pos, size=3){
    if(image_editing_data.grabCutFirst){
        const scale=set2Width>0?set2Width/image_editing_data.img.image.cols:1;
        if(image_editing_data.grabCutAdd==1){
            cv.circle(image_editing_data.mask, new cv.Point(pos.x*scale, pos.y*scale), size*scale, new cv.Scalar(cv.GC_FGD), -1);
        }else if(image_editing_data.grabCutAdd==2){
            cv.circle(image_editing_data.mask, new cv.Point(pos.x*scale, pos.y*scale), size*scale, new cv.Scalar(cv.GC_BGD), -1);
        }
    }
}

function RGBA2RGB(src){
    let srcVector = new cv.MatVector();
    cv.split(src, srcVector);
    let alpha = srcVector.get(3);
    let rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB, 0);

    srcVector.delete();
    src.delete();
    return {rgb: rgb, alpha: alpha};
}

function RGB2RGBA(src, alpha){
    let rgbaVector = new cv.MatVector();
    cv.split(src, rgbaVector);
    rgbaVector.push_back(alpha);
    let rgba = new cv.Mat();
    cv.merge(rgbaVector, rgba);

    alpha.delete();
    rgbaVector.delete();
    src.delete();
    return rgba;
}

function saveGrabCut(){
    const uuid_=uuid();
    if(image_editing_data.grabCutFirst){
        let output = image_editing_data.img.image.mat_clone();
        let outputBack = image_editing_data.img.image.mat_clone();
        let resizeMask = image_editing_data.mask.mat_clone();
        let outputMask = image_editing_data.img.image.mat_clone();
        cv.resize(resizeMask, resizeMask, new cv.Size(output.cols, output.rows), 0, 0, cv.INTER_NEAREST);

        let outData = output.data;
        let outBackData = outputBack.data;
        let outMaskData = outputMask.data;
        let maskData = resizeMask.data;
        const channels = output.channels();
        for (let i = 0; i < maskData.length; i++) {
            let imgIdx = i * channels;
            if (maskData[i] === cv.GC_FGD || maskData[i] === cv.GC_PR_FGD) {
                outBackData[imgIdx + 3] = 0;
                for(let j=0;j<3;j++) outMaskData[imgIdx+j]=255;
                maskData[i]=255;
            }else{
                outData[imgIdx + 3] = 0;
                for(let j=0;j<3;j++) outMaskData[imgIdx+j]=0;
                maskData[i]=0;
            }
            if(channels==4) outMaskData[imgIdx+3]=255;
        }

        if((image_editing_data.img.type==TYPE.ORIGIN||image_editing_data.img.type==TYPE.FIXED) && confirm('是否要修補背景?')){
            if(confirm('使用PatchMatch修補?\n選擇"否"將使用OpenCV進行修補。')){
                let task=newTask("圖像修復", `任務UUID: ${uuid_}`, null);
                let back_data=imageClone(image_editing_data);
                buildInpaintTask(cv, back_data.img.image, resizeMask, (data)=>{
                    // console.log(`Processing Level: ${data.level}, Size: ${data.size[0]}x${data.size[1]}`);
                    // task.update(null, `任務UUID: ${uuid_}<br>Level: ${data.level}, Size: ${data.size[0]}x${data.size[1]}`, data.process);
                    task.update(null, `任務UUID: ${uuid_}<br>進度: ${Math.round(data.process*100)}%`, data.process);
                }).then((data)=>{
                    imageList.push({
                        name: "back_"+image_editing_data.img.name,
                        image: data,
                        uuid: uuid(),
                        type: TYPE.BACKGROUND,
                        height: back_data.img.height,
                        width: back_data.img.width,
                        parent: back_data.img.uuid,
                        sibling: uuid_,
                    });
                    fileUpdate();
                    task.remove();
                    task=null;
                }).catch((err)=>{
                    console.error(err);
                    task.remove();
                    task=null;
                }).finally(()=>{
                    deepImageRemove(back_data);
                });
                
                // imageList.push({
                //     name: "back_"+image_editing_data.img.name,
                //     image: cv.image_complete_js(image_editing_data.img.image, resizeMask),
                //     uuid: uuid(),
                //     type: TYPE.BACKGROUND,
                //     height: image_editing_data.img.height,
                //     width: image_editing_data.img.width,
                //     parent: image_editing_data.img.uuid,
                //     sibling: uuid_,
                // });
            }else{
                let {rgb: outputBackRGB, alpha} = RGBA2RGB(outputBack);

                // 修補背景
                const kernelSize = 5;
                let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
                let tempMask = resizeMask.mat_clone();
                cv.dilate(resizeMask, tempMask, kernel);
                kernel.delete();
                const inpaintRadius = 3;
                cv.inpaint(outputBackRGB, tempMask, outputBackRGB, inpaintRadius, cv.INPAINT_TELEA);    // cv.INPAINT_NS

                outputBack = RGB2RGBA(outputBackRGB, alpha);

                for(let i=0;i<tempMask.data.length;i++){
                    if(tempMask.data[i]>=128)
                        outputBack.data[i*4+3] = 255;
                }

                tempMask.delete();
                
                imageList.push({
                    name: "back_"+image_editing_data.img.name,
                    image: outputBack,
                    uuid: uuid(),
                    type: TYPE.BACKGROUND,
                    height: image_editing_data.img.height,
                    width: image_editing_data.img.width,
                    parent: image_editing_data.img.uuid,
                    sibling: uuid_,
                });
            }

            resizeMask.delete();
        }else{
            imageList.push({
                name: "back_"+image_editing_data.img.name,
                image: outputBack,
                uuid: uuid(),
                type: TYPE.BACKGROUND,
                height: image_editing_data.img.height,
                width: image_editing_data.img.width,
                parent: image_editing_data.img.uuid,
                sibling: uuid_,
            });
        }
        
        imageList.push({
            name: "object_"+image_editing_data.img.name,
            image: output,
            uuid: uuid(),
            type: TYPE.OBJECT,
            height: image_editing_data.img.height,
            width: image_editing_data.img.width,
            parent: image_editing_data.img.uuid,
            sibling: uuid_,
        });
        imageList.push({
            name: "mask_"+image_editing_data.img.name,
            image: outputMask,
            uuid: uuid(),
            type: TYPE.MASK,
            height: image_editing_data.img.height,
            width: image_editing_data.img.width,
            parent: image_editing_data.img.uuid,
            sibling: uuid_,
        });
        fileUpdate();
    }else{
        alert("請先選取物件");
    }
}



function fixImage(){
    if(image_editing_data.mode%10==3){
        let {rgb, alpha} = RGBA2RGB(image_editing_data.img.image);

        // 修補背景
        const kernelSize = 3;
        const inpaintRadius = 3;
        let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
        let tempMask = image_editing_data.mask.mat_clone();
        cv.dilate(image_editing_data.mask, tempMask, kernel);
        let dst = new cv.Mat();
        cv.inpaint(rgb, tempMask, dst, inpaintRadius, cv.INPAINT_NS);    // cv.INPAINT_TELEA
        rgb.delete();
        rgb = dst;

        image_editing_data.img.image = RGB2RGBA(rgb, alpha);

        tempMask.delete();

        image_editing_data.mask.delete();
        image_editing_data.mask = new cv.Mat(
                image_editing_data.img.image.rows,
                image_editing_data.img.image.cols,
                cv.CV_8UC1,
                new cv.Scalar(0)
            );
        cv.imshow(image_editor_canvas, image_editing_data.img.image);
        const ctx=image_editor_mask_canvas.getContext('2d');
        ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
    }
}

function fixImagePatchMatch(){
    if(image_editing_data.mode%10==3){

        let back_data=imageClone(image_editing_data);
        let task=newTask("圖像修復", `任務UUID: ${back_data.img.uuid}`, null);
        buildInpaintTask(cv, back_data.img.image, image_editing_data.mask).then((data)=>{
            image_editing_data.img.image.delete();
            image_editing_data.img.image=data;

            image_editing_data.mask.delete();
            image_editing_data.mask = new cv.Mat(
                    image_editing_data.img.image.rows,
                    image_editing_data.img.image.cols,
                    cv.CV_8UC1,
                    new cv.Scalar(0)
                );
            cv.imshow(image_editor_canvas, image_editing_data.img.image);
            const ctx=image_editor_mask_canvas.getContext('2d');
            ctx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);

            task.remove();
            task=null;
        }).catch((err)=>{
            alert(`修復失敗: ${err}`)
            console.error(err);
            task.remove();
            task=null;
        }).finally(()=>{
            deepImageRemove(back_data);
        });
    }
}

function saveFixImage(){
    if(image_editing_data.mode%10==3){
        imageList.push({
            name: "fix_"+image_editing_data.img.name,
            image: image_editing_data.img.image.mat_clone(),
            uuid: uuid(),
            type: TYPE.FIXED,
            height: image_editing_data.img.height,
            width: image_editing_data.img.width,
            parent: image_editing_data.img.uuid,
        });
        fileUpdate();
    }
}






const merge_layer_select = document.getElementById('merge-layer-select');
merge_layer_select.addEventListener('change', ()=>{
    if(image_editing_data.mode%10==2){
        image_editing_data.select=image_editing_data.layer.length-merge_layer_select.selectedIndex-1;

        drawMergeImage();
    }
});
function updateMergeLayerSelect(select){
    if(!image_editing_data.layer) return;
    let selectOut='';
    let selected=select??merge_layer_select.value;
    for(let i=0;i<image_editing_data.layer.length;i++){
        selectOut=`<option value="${image_editing_data.layer[i].uuid}"${(image_editing_data.layer[i].uuid===selected)?' selected':''}>${image_editing_data.layer.length-i}: ${image_editing_data.layer[i].name}${image_editing_data.adjust[i].base?'*':''}</option>`+selectOut;
        if(image_editing_data.layer[i].uuid===selected) image_editing_data.select=i;
    }
    if(image_editing_data.layer.length<=1) image_editing_data.select=0;
    merge_layer_select.innerHTML=selectOut;
}

function removeMergeLayer(index){
    if(0<=index&&index<image_editing_data.layer.length){
        image_editing_data.layer[index].image.delete();
        image_editing_data.layer[index]=null;
        const isBase=image_editing_data.adjust[index].base;
        image_editing_data.adjust[index]=null;
        image_editing_data.layer=image_editing_data.layer.filter(v=>v!=null);
        image_editing_data.adjust=image_editing_data.adjust.filter(v=>v!=null);
        if(isBase&&image_editing_data.adjust.length>0) image_editing_data.adjust[0].base=true;

        drawMergeImage();
        updateMergeLayerSelect();
    }
}

let drawMergeImageing=false;
function drawMergeImage() {
    if(drawMergeImageing) return;
    if (!image_editing_data.layer) return;

    let baseInfo = image_editing_data.adjust.find(a => a.base);
    if (!baseInfo) {
        alert('沒有照片了QQ');
        setEditImage(null, 'NOPE');
        return;
    }
    drawMergeImageing = true;

    // --- 準備底圖 Mat (僅作為 Light Wrap 的參考取樣) ---
    let baseLayerIdx = image_editing_data.adjust.findIndex(a => a.base);
    let baseMatFull = image_editing_data.layer[baseLayerIdx].image.mat_clone(); 
    if (baseMatFull.channels() === 4) cv.cvtColor(baseMatFull, baseMatFull, cv.COLOR_RGBA2RGB);

    const canvas = document.createElement('canvas');
    canvas.width = baseInfo.w;
    canvas.height = baseInfo.h;
    const ctx = canvas.getContext('2d');

    // --- 高階漸變參數 ---
    const featherRange = 2;        // 羽化寬度 (像素)，數值越大，漸變越長越柔和
    const lightWrapIntensity = 0.3; // 光線滲透強度
    const lightWrapBlur = 7;       // 光線擴散範圍

    for (let i = 0; i < image_editing_data.layer.length; i++) {
        const layerAdj = image_editing_data.adjust[i];
        let w = Math.floor(layerAdj.w), h = Math.floor(layerAdj.h);
        let x = Math.floor(layerAdj.x), y = Math.floor(layerAdj.y);
        let centerX = x + w / 2, centerY = y + h / 2;

        let srcMat;

        if (layerAdj.base) {
            srcMat = image_editing_data.layer[i].image.mat_clone();
        } else {
            // --- 前景圖層處理 ---
            let rawMat = image_editing_data.layer[i].image.mat_clone();
            srcMat = new cv.Mat();
            cv.resize(rawMat, srcMat, new cv.Size(w, h), 0, 0, cv.INTER_LANCZOS4);
            rawMat.delete();

            if (srcMat.channels() === 3) cv.cvtColor(srcMat, srcMat, cv.COLOR_RGB2RGBA);

            if (srcMat.channels() === 4) {
                let channels = new cv.MatVector();
                cv.split(srcMat, channels);
                let a = channels.get(3);

                // ==========================================
                // === 優化後的平滑羽化 (Anti-aliasing Fix) ===
                // ==========================================
                
                let alphaFinal = new cv.Mat();
                
                // 1. 二值化 (Threshold)
                // 先將 Alpha 轉為純黑白，避免原本半透明的雜訊影響距離計算
                // 這能確保邊緣是乾淨的，雖然這一步會暫時產生鋸齒，但後面的 Blur 會修復它
                let binaryMask = new cv.Mat();
                cv.threshold(a, binaryMask, 127, 255, cv.THRESH_BINARY);

                // 2. 內蝕 (Erode) - 移除白邊/髒邊
                // 使用稍微大一點的 kernel 或者多次迭代來確保髒邊被去除
                let kErode = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
                cv.erode(binaryMask, binaryMask, kErode);
                
                // 3. 距離變換 (Distance Transform)
                let dist = new cv.Mat();
                cv.distanceTransform(binaryMask, dist, cv.DIST_L2, 5);
                
                // 4. 映射距離到 Alpha
                // 這裡我們產生初步的 Alpha，但之後會依賴 Blur 來做真正的反鋸齒
                dist.convertTo(alphaFinal, cv.CV_8U, 255.0 / featherRange); 

                // 5. 【關鍵修改】使用更強的 GaussianBlur 來消除鋸齒
                // 如果 featherRange 很小(如 2)，3x3 的 blur 不足以消除距離變換帶來的階梯感。
                // 建議根據 featherRange 動態調整 blur 大小，至少 5x5 或更大。
                // 這步操作才是真正產生「平滑邊緣」的關鍵。
                let blurSize = Math.max(3, (featherRange * 2) + 1); 
                // 確保 blurSize 是奇數
                if (blurSize % 2 === 0) blurSize++; 
                
                cv.GaussianBlur(alphaFinal, alphaFinal, new cv.Size(blurSize, blurSize), 0);

                // ==========================================
                // === 光線包裹 (Light Wrap) 邏輯 (保持不變) ===
                // ==========================================
                // 注意：這裡你的 Light Wrap 邏輯依賴 alphaFinal
                // 現在 alphaFinal 已經經過平滑處理，Light Wrap 的效果也會更自然
                
                let x1 = Math.max(0, x), y1 = Math.max(0, y);
                let x2 = Math.min(baseMatFull.cols, x + w);
                let y2 = Math.min(baseMatFull.rows, y + h);
                let overlapW = x2 - x1, overlapH = y2 - y1;

                if (overlapW > 0 && overlapH > 0) {
                    try {
                        let rect = new cv.Rect(x1, y1, overlapW, overlapH);
                        let bgROI = baseMatFull.roi(rect);
                        let bgMatched = new cv.Mat.zeros(h, w, cv.CV_8UC3);
                        let destRect = new cv.Rect(x1 - x, y1 - y, overlapW, overlapH);
                        let bgMatchedROI = bgMatched.roi(destRect);
                        bgROI.copyTo(bgMatchedROI);

                        let bgGray = new cv.Mat();
                        cv.cvtColor(bgMatched, bgGray, cv.COLOR_RGB2GRAY);
                        let brightMask = new cv.Mat();
                        cv.threshold(bgGray, brightMask, 180, 255, cv.THRESH_BINARY);

                        let wrapZone = new cv.Mat();
                        cv.bitwise_not(alphaFinal, wrapZone); 
                        // 使用 binaryMask 而不是 a，確保光不會滲透到完全透明的地方
                        cv.bitwise_and(wrapZone, binaryMask, wrapZone); 

                        let lightToApply = new cv.Mat();
                        cv.bitwise_and(brightMask, wrapZone, lightToApply);
                        cv.GaussianBlur(lightToApply, lightToApply, new cv.Size(lightWrapBlur, lightWrapBlur), 0);

                        let bgChannels = new cv.MatVector();
                        cv.split(bgMatched, bgChannels);
                        for (let j = 0; j < 3; j++) {
                            let ch = channels.get(j);
                            let lightLayer = new cv.Mat();
                            cv.multiply(bgChannels.get(j), lightToApply, lightLayer, lightWrapIntensity / 255.0);
                            cv.add(ch, lightLayer, ch);
                            lightLayer.delete();
                        }

                        bgROI.delete(); bgMatched.delete(); bgMatchedROI.delete(); bgGray.delete();
                        brightMask.delete(); wrapZone.delete(); lightToApply.delete(); bgChannels.delete();
                    } catch (e) { console.error("Light Wrap failed:", e); }
                }

                channels.set(3, alphaFinal);
                cv.merge(channels, srcMat);

                // 記憶體清理
                binaryMask.delete(); kErode.delete(); dist.delete(); alphaFinal.delete();
                channels.delete(); a.delete();
            }
        }

        let tempCanvas = document.createElement('canvas');
        cv.imshow(tempCanvas, srcMat);
        srcMat.delete();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
        ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    baseMatFull.delete();
    let output = cv.imread(canvas);
    cv.imshow(image_editor_canvas, output);
    output.delete();
    drawMergeImageing = false;
}

function moveItemInArray(arr, fromIndex, toIndex) {
    const [removedItem] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, removedItem);
    return arr;
}

function changeMergeBase(index){
    if(image_editing_data.layer){
        if(!(0<=index&&index<image_editing_data.adjust.length)) return;
        if(image_editing_data.adjust[index].base) return;
        let base=null;
        for(let i=0;i<image_editing_data.adjust.length;i++){
            if(image_editing_data.adjust[i].base){
                base={index:i, data: image_editing_data.adjust[i]};
            }
        }
        if(base==null) return;

        base.data.base=false;
        base=image_editing_data.adjust[index];
        base.x=0;
        base.y=0;
        base.h=image_editing_data.layer[index].image.rows;
        base.w=image_editing_data.layer[index].image.cols;
        base.base=true;
        image_editing_data.height=base.h;
        image_editing_data.width=base.w;

        for(let i=0;i<image_editing_data.adjust.length;i++){
            if(i!=index){
                const scale=Math.min(
                    base.w/image_editing_data.layer[i].image.cols,
                    base.h/image_editing_data.layer[i].image.rows,
                    1,
                );

                image_editing_data.adjust[i].x=0;
                image_editing_data.adjust[i].y=0;
                image_editing_data.adjust[i].h=Math.floor(image_editing_data.layer[i].image.rows*scale);
                image_editing_data.adjust[i].w=Math.floor(image_editing_data.layer[i].image.cols*scale);
                image_editing_data.adjust[i].rotate=0;
                image_editing_data.adjust[i].mirror_h=false;
                image_editing_data.adjust[i].mirror_v=false;
            }
        }

        updateMergeLayerSelect();
        drawMergeImage();
    }
}

function resizeMergeImage(index, scale=0, xy=0){
    if(scale<=0) return;
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=index&&index<image_editing_data.layer.length){
            const h_=Math.floor(image_editing_data.adjust[index].h*((xy%2==1)?scale:1));
            const w_=Math.floor(image_editing_data.adjust[index].w*((xy/2>=1)?scale:1));
            image_editing_data.adjust[index].x+=Math.floor((image_editing_data.adjust[index].w-w_)/2);
            image_editing_data.adjust[index].y+=Math.floor((image_editing_data.adjust[index].h-h_)/2);
            image_editing_data.adjust[index].h=h_;
            image_editing_data.adjust[index].w=w_;

            drawMergeImage();
        }
    }
}

function mirrorMergeImage(index, direction=0){
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=index&&index<image_editing_data.layer.length){
            if(direction==0)
                image_editing_data.adjust[index].mirror_h=!(image_editing_data.adjust[index].mirror_h===true);
            else
                image_editing_data.adjust[index].mirror_v=!(image_editing_data.adjust[index].mirror_v===true);

            drawMergeImage();
        }
    }
}

function rotateMergeImage(index, rotate=0){
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=index&&index<image_editing_data.layer.length){
            image_editing_data.adjust[index].rotate=rotate;

            drawMergeImage();
        }
    }
}

function saveMergeImage(){
    if (!image_editing_data.layer) return;

    // 1. 尋找 Base (背景) 以確定畫布大小
    let baseIndex=0;
    let base = image_editing_data.adjust.find((a, i) => {baseIndex = i;return a.base});
    if (!base) {
        alert('沒有照片了QQ');
        setEditImage(null, 'NOPE');
        return;
    }

    drawMergeImage();
    let output = cv.imread(image_editor_canvas);

    imageList.push({
        name: "merge_"+image_editing_data.layer[baseIndex].name,
        image: output,
        uuid: uuid(),
        type: TYPE.ORIGIN,
        height: base.h,
        width: base.w,
    });
    fileUpdate();
}

function resetMergeImage(index){
    if(image_editing_data.layer&&0<=index&&index<image_editing_data.layer.length){
        let base=null;
        for(let i=0;i<image_editing_data.adjust.length;i++){
            if(image_editing_data.adjust[i].base){
                base=image_editing_data.adjust[i];
            }
        }
        if(base==null) return;

        const scale=Math.min(
            base.w/image_editing_data.layer[index].image.cols,
            base.h/image_editing_data.layer[index].image.rows,
            1,
        );

        image_editing_data.adjust[index].x=0;
        image_editing_data.adjust[index].y=0;
        image_editing_data.adjust[index].h=Math.floor(image_editing_data.layer[index].image.rows*scale);
        image_editing_data.adjust[index].w=Math.floor(image_editing_data.layer[index].image.cols*scale);
        image_editing_data.adjust[index].rotate=0;
        image_editing_data.adjust[index].mirror_h=false;
        image_editing_data.adjust[index].mirror_v=false;

        drawMergeImage();
    }
}


function applyGrayWorldWhiteBalance(index) {
    if(!(image_editing_data.layer&&0<=index&&index<image_editing_data.layer.length)) return;

    let  result=grayWorldWhiteBalance(image_editing_data.layer[index].image);
    image_editing_data.layer[index].image.delete();
    image_editing_data.layer[index].image=result;

    drawMergeImage();
}

function grayWorldWhiteBalance(src){
    let output=src.mat_clone();


    let channels = new cv.MatVector();
    cv.split(output, channels);

    let r = channels.get(0);
    let g = channels.get(1);
    let b = channels.get(2);
    let a = channels.get(3);

    // 計算平均值
    let meanR = cv.mean(r, a)[0];
    let meanG = cv.mean(g, a)[0];
    let meanB = cv.mean(b, a)[0];

    // 灰度世界假設：平均值應該趨近於灰色
    let avgGray = (meanR + meanG + meanB) / 3;

    // 計算增益係數
    let scaleR = avgGray / (meanR || 0.001);
    let scaleG = avgGray / (meanG || 0.001);
    let scaleB = avgGray / (meanB || 0.001);

    // 應用增益 (利用 convertScaleAbs 或 multiply)
    // 在 JS 中直接用 multiply scalar 比較麻煩，這裡用 convertScaleAbs 模擬線性變換
    r.convertTo(r, -1, scaleR, 0);
    g.convertTo(g, -1, scaleG, 0);
    b.convertTo(b, -1, scaleB, 0);

    cv.merge(channels, output);

    // 清理
    channels.delete();
    r.delete();
    g.delete();
    b.delete();
    a.delete();

    return output;
}

function applyGrayEdgeWhiteBalance(index) {
    if(!(image_editing_data.layer&&0<=index&&index<image_editing_data.layer.length)) return;

    let  result=grayEdgeWhiteBalance(image_editing_data.layer[index].image);
    image_editing_data.layer[index].image.delete();
    image_editing_data.layer[index].image=result;

    drawMergeImage();
}

function grayEdgeWhiteBalance(src) {
    let output = src.clone();

    // 1. 轉為 RGB (計算用)
    let srcRGB = new cv.Mat();
    cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);

    // 2. 分離通道
    let channels = new cv.MatVector();
    cv.split(srcRGB, channels);
    let r = channels.get(0);
    let g = channels.get(1);
    let b = channels.get(2);

    // 3. 計算邊緣 (Sobel)
    // 使用 CV_32F 以避免數值溢位並支援 magnitude 計算
    let ddepth = cv.CV_32F;
    let ksize = 1; 
    let scale = 1;
    let delta = 0;

    let rX = new cv.Mat(), rY = new cv.Mat();
    let gX = new cv.Mat(), gY = new cv.Mat();
    let bX = new cv.Mat(), bY = new cv.Mat();

    // R 通道梯度
    cv.Sobel(r, rX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(r, rY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);
    
    // G 通道梯度
    cv.Sobel(g, gX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(g, gY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);
    
    // B 通道梯度
    cv.Sobel(b, bX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(b, bY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);

    // 4. 【修正點】計算邊緣強度 (Magnitude)
    // 原本錯誤的 cv.Mat.abs 已被移除，改用標準的 cv.magnitude
    let rMag = new cv.Mat(), gMag = new cv.Mat(), bMag = new cv.Mat();
    
    cv.magnitude(rX, rY, rMag); // 計算 sqrt(rX^2 + rY^2)
    cv.magnitude(gX, gY, gMag);
    cv.magnitude(bX, bY, bMag);

    // 5. Minkowski Norm (p=1, 取平均)
    // 這裡我們計算所有邊緣強度的平均值
    let meanR = cv.mean(rMag)[0];
    let meanG = cv.mean(gMag)[0];
    let meanB = cv.mean(bMag)[0];

    // 6. 計算增益 (以平均邊緣強度為基準)
    // 假設「平均邊緣顏色」應該是灰色的
    let avgEdge = (meanR + meanG + meanB) / 3;
    
    // 避免除以 0
    let scaleR = avgEdge / (meanR || 0.001);
    let scaleG = avgEdge / (meanG || 0.001);
    let scaleB = avgEdge / (meanB || 0.001);

    // 7. 增益限制 (Clamping) - 安全機制
    // 限制增益不要超過 2.0 倍，也不要小於 0.5
    let maxGain = 2.0; 
    let minGain = 0.5;

    scaleR = Math.max(minGain, Math.min(scaleR, maxGain));
    scaleG = Math.max(minGain, Math.min(scaleG, maxGain));
    scaleB = Math.max(minGain, Math.min(scaleB, maxGain));

    // 8. 應用增益到原圖
    // 因為 scale 是針對 32F 的計算結果，但原圖是 8U，convertScaleAbs 可以直接處理縮放並轉回 8U
    let outChannels = new cv.MatVector();
    cv.split(output, outChannels);
    
    outChannels.get(0).convertTo(outChannels.get(0), -1, scaleR, 0);
    outChannels.get(1).convertTo(outChannels.get(1), -1, scaleG, 0);
    outChannels.get(2).convertTo(outChannels.get(2), -1, scaleB, 0);
    
    cv.merge(outChannels, output);

    // 9. 清理記憶體
    srcRGB.delete(); channels.delete(); 
    r.delete(); g.delete(); b.delete();
    rX.delete(); rY.delete(); gX.delete(); gY.delete(); bX.delete(); bY.delete();
    rMag.delete(); gMag.delete(); bMag.delete(); 
    outChannels.delete();

    return output;
}

function applyRobustWhitePatchWhiteBalance(index, iterations = 2) {
    if(!(image_editing_data.layer&&0<=index&&index<image_editing_data.layer.length)) return;


    let  result=robustWhitePatchWhiteBalance(image_editing_data.layer[index].image);
    image_editing_data.layer[index].image.delete();
    image_editing_data.layer[index].image=result;

    drawMergeImage();
}

function robustWhitePatchWhiteBalance(src) {
    let output = src.clone();
    
    // 1. 轉換到 HSV 色彩空間來分析飽和度
    let hsv = new cv.Mat();
    let srcRGB = new cv.Mat();
    // OpenCV.js 的 input 通常是 RGBA，轉換前建議先轉 RGB
    cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);
    cv.cvtColor(srcRGB, hsv, cv.COLOR_RGB2HSV);

    // 2. 分離通道 (H, S, V)
    let hsvChannels = new cv.MatVector();
    cv.split(hsv, hsvChannels);
    let s = hsvChannels.get(1); // 飽和度
    let v = hsvChannels.get(2); // 亮度 (Value)

    // 3. 找出亮度的閾值 (Top 1% 最亮)
    // 為了效能，這裡簡化計算，直接找亮度直方圖
    let histSize = [256];
    let ranges = [0, 255];
    let hist = new cv.Mat();
    let maskBrightness = new cv.Mat();
    let maskSaturation = new cv.Mat();
    let finalMask = new cv.Mat();
    let none = new cv.Mat();
    let vVec = new cv.MatVector(); 
    vVec.push_back(v);

    cv.calcHist(vVec, [0], none, hist, histSize, ranges);

    let totalPixels = src.rows * src.cols;
    let topPercentileCount = totalPixels * 0.01; // 取前 1%
    let brightnessThreshold = 255;
    let currentCount = 0;

    for (let i = 255; i >= 0; i--) {
        currentCount += hist.data32F[i];
        if (currentCount >= topPercentileCount) {
            brightnessThreshold = i;
            break;
        }
    }

    // 4. 建立遮罩
    // 條件 A: 亮度夠高 ( >= brightnessThreshold )
    cv.threshold(v, maskBrightness, brightnessThreshold, 255, cv.THRESH_BINARY);
    
    // 條件 B: 飽和度夠低 ( <= 60 ) -> 0~255 範圍中，60 大約是 23% 的飽和度
    // 這樣可以過濾掉鮮豔的顏色 (如紅花、綠葉)，只保留接近白色/灰色的高光
    cv.threshold(s, maskSaturation, 60, 255, cv.THRESH_BINARY_INV);

    // 5. 結合兩個條件 (Mask = Brightness AND LowSaturation)
    cv.bitwise_and(maskBrightness, maskSaturation, finalMask);

    // 【安全機制】如果畫面中完全沒有「亮且不鮮豔」的點（例如全畫面都是鮮紅），
    // finalMask 會幾乎全黑。這時應該放棄修正或改用 Gray World，
    // 這裡我們選擇：若有效像素太少，就不做強烈修正 (降級為全圖平均)
    let validPixels = cv.countNonZero(finalMask);
    if (validPixels < 10) { 
        // 找不到參考白點，回退使用 Gray World 或放棄
        // 這裡示範簡單的 fallback: 把 mask 設為全白 (退化成 Gray World)
        finalMask.setTo(new cv.Scalar(255)); 
    }

    // 6. 計算參考白色的平均值
    let meanScalar = cv.mean(srcRGB, finalMask); // 這裡用 srcRGB 算比較準
    let meanR = meanScalar[0];
    let meanG = meanScalar[1];
    let meanB = meanScalar[2];

    // 7. 計算增益 (Gain) - 加入安全限制 (Clamp)
    // 你的 C++ 代碼中限制最大增益為 3.0，這也是一個很好的保護機制
    let maxGain = 2.5; // 稍微保守一點
    let minGain = 0.4; // 防止過度壓暗

    // 避免除以 0
    let avgGray = (meanR + meanG + meanB) / 3;
    let scaleR = (meanR > 1) ? (avgGray / meanR) : 1.0; 
    let scaleG = (meanG > 1) ? (avgGray / meanG) : 1.0;
    let scaleB = (meanB > 1) ? (avgGray / meanB) : 1.0;

    // 這裡改用 "保持亮度" 的策略：把最大通道拉到 255 (這是 White Patch 的原意)
    // 或者用 "平均灰" 策略。這裡採用 White Patch 的標準做法：
    // 目標是讓 (R,G,B) 都變成 max(R,G,B) 或是 255
    let maxVal = Math.max(meanR, Math.max(meanG, meanB));
    scaleR = (meanR > 1) ? (maxVal / meanR) : 1.0;
    scaleG = (meanG > 1) ? (maxVal / meanG) : 1.0;
    scaleB = (meanB > 1) ? (maxVal / meanB) : 1.0;

    // 限制增益範圍 (Clamping)
    scaleR = Math.max(minGain, Math.min(scaleR, maxGain));
    scaleG = Math.max(minGain, Math.min(scaleG, maxGain));
    scaleB = Math.max(minGain, Math.min(scaleB, maxGain));

    // 8. 應用增益
    let channels = new cv.MatVector();
    cv.split(output, channels);
    channels.get(0).convertTo(channels.get(0), -1, scaleR, 0);
    channels.get(1).convertTo(channels.get(1), -1, scaleG, 0);
    channels.get(2).convertTo(channels.get(2), -1, scaleB, 0);
    cv.merge(channels, output);

    // 清理記憶體
    hsv.delete(); srcRGB.delete(); hsvChannels.delete(); s.delete(); v.delete();
    hist.delete(); maskBrightness.delete(); maskSaturation.delete(); finalMask.delete();
    none.delete(); vVec.delete(); channels.delete();

    return output;
}

function colorMatch(refIndex, targetIndex) {
    let refSrc = image_editing_data.layer[refIndex].image;
    let tgtSrc = image_editing_data.layer[targetIndex].image;

    // 轉換到 Lab 空間
    let refLab = new cv.Mat();
    cv.cvtColor(refSrc, refLab, cv.COLOR_RGBA2RGB);
    cv.cvtColor(refLab, refLab, cv.COLOR_RGB2Lab);
    
    // 使用你原本處理目標圖層 Alpha 的方式
    let {rgb: tgtLab, alpha: tgtAlpha} = RGBA2RGB(tgtSrc);
    cv.cvtColor(tgtLab, tgtLab, cv.COLOR_RGB2Lab);

    let refChannels = new cv.MatVector();
    let tgtChannels = new cv.MatVector();
    cv.split(refLab, refChannels);
    cv.split(tgtLab, tgtChannels);

    /**
     * 改良版遮罩：結合亮度過濾與邊緣檢測 (Gray Edge 思路)
     */
    function createEdgeEnhancedMask(labMat) {
        let channels = new cv.MatVector();
        cv.split(labMat, channels);
        let L = channels.get(0); // 亮度通道
        
        // 1. 亮度過濾 (排除極端值)
        let rangeMask = new cv.Mat();
        cv.inRange(L, new cv.Mat(1, 1, cv.CV_8U, [40, 0, 0, 0]), new cv.Mat(1, 1, cv.CV_8U, [220, 0, 0, 0]), rangeMask);

        // 2. 邊緣檢測 (Sobel)
        let gradX = new cv.Mat();
        let gradY = new cv.Mat();
        let gradAbs = new cv.Mat();
        cv.Sobel(L, gradX, cv.CV_16S, 1, 0, 3); // X 方向梯度
        cv.Sobel(L, gradY, cv.CV_16S, 0, 1, 3); // Y 方向梯度
        cv.convertScaleAbs(gradX, gradX);
        cv.convertScaleAbs(gradY, gradY);
        cv.addWeighted(gradX, 0.5, gradY, 0.5, 0, gradAbs); // 合併梯度

        // 3. 取得高梯度區域 (排除平滑的大色塊)
        let edgeMask = new cv.Mat();
        // 門檻值 20-40 之間可調整，越大代表越只看「細節」
        cv.threshold(gradAbs, edgeMask, 30, 255, cv.THRESH_BINARY);

        // 4. 合併遮罩：又是中間亮度，又是邊緣
        let finalMask = new cv.Mat();
        cv.bitwise_and(rangeMask, edgeMask, finalMask);

        // 清理暫存
        channels.delete(); L.delete(); rangeMask.delete(); 
        gradX.delete(); gradY.delete(); gradAbs.delete(); edgeMask.delete();
        
        return finalMask;
    }

    let refMask = createEdgeEnhancedMask(refLab);
    let tgtMask = createEdgeEnhancedMask(tgtLab);

    // 檢查遮罩是否太稀疏 (如果圖太糊沒邊緣，則退回用亮度遮罩)
    if (cv.countNonZero(refMask) < 100 || cv.countNonZero(tgtMask) < 100) {
        // ...這裡可以寫退路邏輯，或者調低 threshold...
    }

    let mRef = new cv.Mat();
    let sRef = new cv.Mat();
    let mTgt = new cv.Mat();
    let sTgt = new cv.Mat();

    for (let i = 0; i < 3; i++) {
        let rChan = refChannels.get(i);
        let tChan = tgtChannels.get(i);

        cv.meanStdDev(rChan, mRef, sRef, refMask);
        cv.meanStdDev(tChan, mTgt, sTgt, tgtMask);

        let muRef = mRef.doubleAt(0);
        let sigmaRef = sRef.doubleAt(0);
        let muTgt = mTgt.doubleAt(0);
        let sigmaTgt = sTgt.doubleAt(0);

        let alpha = sigmaRef / (sigmaTgt || 0.001);
        let beta = muRef - (muTgt * alpha);
        
        tChan.convertTo(tChan, -1, alpha, beta);
    }

    // 合併與還原
    cv.merge(tgtChannels, tgtLab);
    cv.cvtColor(tgtLab, tgtLab, cv.COLOR_Lab2RGB);
    
    image_editing_data.layer[targetIndex].image = RGB2RGBA(tgtLab, tgtAlpha);

    // 清理所有記憶體
    refLab.delete(); refChannels.delete(); tgtChannels.delete();
    refMask.delete(); tgtMask.delete();
    mRef.delete(); sRef.delete(); mTgt.delete(); sTgt.delete();

    drawMergeImage();
}

function saveMergeImageSeamless() {
    if (!image_editing_data.layer) return;

    // 1. 尋找 Base (背景) 以確定畫布大小
    let baseIndex = 0;
    let base = image_editing_data.adjust.find((a, i) => {
        baseIndex = i;
        return a.base
    });

    if (!base) {
        alert('沒有照片了QQ');
        setEditImage(null, 'NOPE');
        return;
    }

    // 準備最終結果的 Mat (Dst)
    let baseMatRGBA = image_editing_data.layer[baseIndex].image.clone();
    let dstRGB = new cv.Mat();
    cv.cvtColor(baseMatRGBA, dstRGB, cv.COLOR_RGBA2RGB);
    baseMatRGBA.delete();

    // 2. 遍歷圖層
    for (let i = 0; i < image_editing_data.layer.length; i++) {
        if (i === baseIndex) continue;

        const layerAdj = image_editing_data.adjust[i];
        
        let w = layerAdj.w;
        let h = layerAdj.h;
        // 這是物件在底圖上的目標中心點座標 (重要！)
        let targetCenterX = layerAdj.x + w / 2;
        let targetCenterY = layerAdj.y + h / 2;

        // --- 步驟 A: 計算旋轉後的 Bounding Box ---
        // 因為旋轉後圖片佔用的寬高會變大，我們需要計算一個剛好能裝下的 Canvas
        let angle = (layerAdj.rotate ?? 0);
        let rad = angle * Math.PI / 180;
        
        // 計算旋轉後的新寬高 (Bounding Box)
        let patchW = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
        let patchH = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));

        // 建立「切片」大小的 Canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = patchW;
        tempCanvas.height = patchH;
        const ctx = tempCanvas.getContext('2d');

        let srcMat = image_editing_data.layer[i].image;
        let assetCanvas = document.createElement('canvas');
        cv.imshow(assetCanvas, srcMat);

        ctx.save();
        // 將繪製原點移到小 Canvas 的中心
        ctx.translate(patchW / 2, patchH / 2);
        ctx.rotate(rad);
        ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
        // 畫圖 (以自身中心為基準)
        ctx.drawImage(assetCanvas, -w / 2, -h / 2, w, h);
        ctx.restore();

        // --- 步驟 B: 準備 SeamlessClone ---
        
        // 1. 讀取切片 Canvas
        let layerFullRGBA = cv.imread(tempCanvas);
        
        // 2. 分離通道
        let layerVector = new cv.MatVector();
        cv.split(layerFullRGBA, layerVector);
        
        let layerRGB = new cv.Mat();
        let layerAlpha = layerVector.get(3);
        
        let tempVec = new cv.MatVector();
        tempVec.push_back(layerVector.get(0));
        tempVec.push_back(layerVector.get(1));
        tempVec.push_back(layerVector.get(2));
        cv.merge(tempVec, layerRGB);

        // 3. 處理 Mask (二值化)
        cv.threshold(layerAlpha, layerAlpha, 10, 255, cv.THRESH_BINARY);

        // --- 步驟 C: 執行 SeamlessClone ---
        
        // 關鍵修正：這裡的 center 要設定為「物件在 Base 上的絕對座標」
        // 因為 src 只是那個小切片，seamlessClone 會把 src 的中心對齊到這裡
        let center = new cv.Point(targetCenterX, targetCenterY);
        
        let clonedOutput = new cv.Mat();
        
        try {
            // 檢查邊界：如果 center 太靠近邊緣，seamlessClone 可能會報錯或崩潰
            // 簡單檢查一下 (非必要，但在邊緣操作時較安全)
            if (targetCenterX > 0 && targetCenterX < base.w && targetCenterY > 0 && targetCenterY < base.h) {
                 cv.seamlessClone(layerRGB, dstRGB, layerAlpha, center, clonedOutput, cv.NORMAL_CLONE);
                 
                 dstRGB.delete(); 
                 dstRGB = clonedOutput; 
            } else {
                console.warn("Layer " + i + " is out of bounds, skipping seamless clone.");
                clonedOutput.delete();
            }
        } catch (e) {
            console.error("SeamlessClone failed for layer " + i, e);
            clonedOutput.delete();
        }

        // --- 步驟 D: 清理 ---
        layerFullRGBA.delete();
        layerVector.delete();
        layerRGB.delete();
        layerAlpha.delete();
        tempVec.delete();
        assetCanvas = null;
    }

    // 3. 輸出結果
    // 這裡記得要用 dstRGB，它是被累積更新的結果
    let finalRGBA = RGB2RGBA(dstRGB, new cv.Mat(dstRGB.rows, dstRGB.cols, cv.CV_8UC1, new cv.Scalar(255)));
    
    imageList.push({
        name: "merge_seamless_" + image_editing_data.layer[baseIndex].name,
        image: finalRGBA,
        uuid: uuid(),
        type: TYPE.ORIGIN,
        height: base.h,
        width: base.w,
    });
    fileUpdate();
}
