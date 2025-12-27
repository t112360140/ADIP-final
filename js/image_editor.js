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

    Relight: 14,

    View: 91,
}

var image_editing_data={};

const image_editor_canvas_div = document.getElementById('image-editor-canvas-div');
const image_editor_canvas = document.getElementById('image-editor-canvas');
const image_editor_mask_canvas = document.getElementById('image-editor-mask-canvas');

var PM_iters=8;

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
    if(image_editing_data.mode&&(image_editing_data.mode%10==1||image_editing_data.mode%10==3)){
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
    }else if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=image_editing_data.select&&image_editing_data.select<image_editing_data.layer.length){
            const pos={
                x: event.offsetX*(image_editing_data.width/image_editor_canvas_div.offsetWidth),
                y:event.offsetY*(image_editing_data.height/image_editor_canvas_div.offsetHeight),
            };
            mouseData.isDown=true;
            mouseData.start=pos;
        }
    }else if(image_editing_data.mode&&image_editing_data.mode%10==4){
        image_editing_data.x=event.offsetX*(image_editing_data.img.width/image_editor_canvas_div.offsetWidth);
        image_editing_data.y=event.offsetY*(image_editing_data.img.height/image_editor_canvas_div.offsetHeight);

        updateRelightData();
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
            
            drawMergeImage(true);
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
    Relight: document.getElementById('Relight-menu'),
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
        case 4:
            deepImageRemove(image_editing_data);
            image_editing_data={
                img: imageClone(image),
                mode: MODE[mode],

                x:0,
                y:0,
                z:100,
                range: 500,
                intensity: 1,
                shadowIntensity: 1,
                smoothness: 51,
                half: true,
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
            editMenu.PhotoFix.style.display='block';
            image_editing_data.mask = new cv.Mat(
                image_editing_data.img.image.rows,
                image_editing_data.img.image.cols,
                cv.CV_8UC1,
                new cv.Scalar(0)
            );
            opencv_info.innerHTML='標記想要修補的部分';
            break;
        case MODE.PhotoFixWhite:
            editMenu.PhotoFix.style.display='block';
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
        case MODE.Relight:
            editMenu.Relight.style.display='block';
            opencv_info.innerHTML='標記想要修改的光源位置';
            updateRelightData(false);
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
        src.convertTo(newSrc, -1, 1.2, 0);
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
                buildInpaintTask(cv, back_data.img.image, resizeMask, PM_iters).then((data)=>{
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
            }else{
                let {rgb: outputBackRGB, alpha} = RGBA2RGB(outputBack);
                const kernelSize = 5;
                let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
                let tempMask = resizeMask.mat_clone();
                cv.dilate(resizeMask, tempMask, kernel);
                kernel.delete();
                const inpaintRadius = 3;
                cv.inpaint(outputBackRGB, tempMask, outputBackRGB, inpaintRadius, cv.INPAINT_TELEA);

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
        const kernelSize = 3;
        const inpaintRadius = 3;
        let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
        let tempMask = image_editing_data.mask.mat_clone();
        cv.dilate(image_editing_data.mask, tempMask, kernel);
        let dst = new cv.Mat();
        cv.inpaint(rgb, tempMask, dst, inpaintRadius, cv.INPAINT_NS);
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
        buildInpaintTask(cv, back_data.img.image, image_editing_data.mask, PM_iters).then((data)=>{
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
        updateMergeLayerSelect(merge_layer_select.value);
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

    document.getElementById('image-rotate').value=image_editing_data.adjust[image_editing_data.select].rotate??0;

    if(image_editing_data.shadow){
        document.getElementById('shadow-enable').checked=true;
        document.getElementById('shadow-angle').value=image_editing_data.shadow.angle;
        document.getElementById('shadow-length').value=image_editing_data.shadow.length;
        document.getElementById('shadow-decay').value=image_editing_data.shadow.decay;
    }else{
        document.getElementById('shadow-enable').checked=false;
    }

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
function drawMergeImage(isPreview = false) {
    if (drawMergeImageing) return;
    if (!image_editing_data.layer) return;

    let baseInfo = image_editing_data.adjust.find(a => a.base);
    if (!baseInfo) {
        alert('沒有照片了QQ');
        setEditImage(null, 'NOPE');
        return;
    }
    
    drawMergeImageing = true;
    
    let scale = 1.0;
    if (isPreview) {
        const PREVIEW_MAX_DIM = 800; 
        const maxSide = Math.max(baseInfo.w, baseInfo.h);
        if (maxSide > PREVIEW_MAX_DIM) scale = PREVIEW_MAX_DIM / maxSide;
    }

    image_editor_canvas.height = baseInfo.h;
    image_editor_canvas.width = baseInfo.w;
    image_editor_mask_canvas.height = baseInfo.h;
    image_editor_mask_canvas.width = baseInfo.w;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(baseInfo.w * scale);
    canvas.height = Math.floor(baseInfo.h * scale);
    const ctx = canvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    const maskBuffer = document.createElement('canvas');
    maskBuffer.width = canvas.width;
    maskBuffer.height = canvas.height;
    const maskBufferCtx = maskBuffer.getContext('2d');
    let isMaskDrawn = false;

    const featherRange = 2; 

    try {
        for (let i = 0; i < image_editing_data.layer.length; i++) {
            const layerAdj = image_editing_data.adjust[i];
            const layerData = image_editing_data.layer[i];
            
            let w = Math.floor(layerAdj.w * scale);
            let h = Math.floor(layerAdj.h * scale);
            let x = Math.floor(layerAdj.x * scale);
            let y = Math.floor(layerAdj.y * scale);
            let centerX = x + w / 2;
            let centerY = y + h / 2;

            // 1. OpenCV 羽化
            if (!layerAdj.base && !layerData.is_feathered) {
                console.log(`Layer ${i} 正在進行初次羽化處理...`);
                let srcMat = layerData.image.mat_clone();
                if (srcMat.channels() === 3) cv.cvtColor(srcMat, srcMat, cv.COLOR_RGB2RGBA);
                if (srcMat.channels() === 4) {
                    let channels = new cv.MatVector();
                    cv.split(srcMat, channels);
                    let a = channels.get(3);
                    let binaryMask = new cv.Mat();
                    cv.threshold(a, binaryMask, 127, 255, cv.THRESH_BINARY);
                    a.delete(); 
                    let kErode = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
                    cv.erode(binaryMask, binaryMask, kErode);
                    let dist = new cv.Mat();
                    cv.distanceTransform(binaryMask, dist, cv.DIST_L2, 5);
                    let alphaFinal = new cv.Mat();
                    dist.convertTo(alphaFinal, cv.CV_8U, 255.0 / featherRange); 
                    let blurSize = Math.max(3, (featherRange * 2) + 1); 
                    if (blurSize % 2 === 0) blurSize++; 
                    cv.GaussianBlur(alphaFinal, alphaFinal, new cv.Size(blurSize, blurSize), 0);
                    channels.set(3, alphaFinal);
                    cv.merge(channels, srcMat);
                    channels.delete();
                    binaryMask.delete();
                    kErode.delete();
                    dist.delete();
                    alphaFinal.delete();
                    if (layerData.image) layerData.image.delete();
                    layerData.image = srcMat;
                    layerData.is_feathered = true;
                } else {
                    srcMat.delete();
                }
            }

            // 2. 準備乾淨圖層
            let rawMat = layerData.image; 
            let dispMat = new cv.Mat();
            cv.resize(rawMat, dispMat, new cv.Size(w, h), 0, 0, cv.INTER_LINEAR);
            cv.imshow(tempCanvas, dispMat);
            dispMat.delete();

            if(image_editing_data.select == i){
                maskBufferCtx.save();
                maskBufferCtx.globalAlpha = 0.3;
                maskBufferCtx.translate(centerX, centerY);
                maskBufferCtx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
                maskBufferCtx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
                maskBufferCtx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
                maskBufferCtx.restore();
                isMaskDrawn = true;
            }

            // ============================================================
            //  [NEW] 實心無縫微條帶陰影 (統計學接地判斷版)
            // ============================================================
            if (image_editing_data.shadow && !layerAdj.base) {
                const shadowCfg = image_editing_data.shadow;
                
                const dsRatio = 0.5; 
                
                const rotRad = (layerAdj.rotate ?? 0) * Math.PI / 180;
                const absCos = Math.abs(Math.cos(rotRad));
                const absSin = Math.abs(Math.sin(rotRad));
                const rotW = w * absCos + h * absSin;
                const rotH = w * absSin + h * absCos;
                
                const smallW = Math.ceil(rotW * dsRatio);
                const smallH = Math.ceil(rotH * dsRatio);

                // 計算動態畫布大小
                const globalAngleRad = shadowCfg.angle * Math.PI / 180;
                const smallMaxDim = Math.max(smallW, smallH); 
                const shadowLenBase = smallMaxDim * shadowCfg.length; 
                const vecX = Math.cos(globalAngleRad) * shadowLenBase;
                const vecY = Math.sin(globalAngleRad) * shadowLenBase;

                const extendX = Math.abs(vecX);
                const extendY = Math.abs(vecY);
                const canvasW = Math.ceil((smallW + extendX) * 2.5);
                const canvasH = Math.ceil((smallH + extendY) * 2.5);
                const cX = canvasW / 2;
                const cY = canvasH / 2;

                const smallCanvas = document.createElement('canvas');
                smallCanvas.width = canvasW;
                smallCanvas.height = canvasH;
                const sCtx = smallCanvas.getContext('2d');

                sCtx.save();
                sCtx.translate(cX, cY);
                sCtx.rotate(rotRad);
                sCtx.scale(dsRatio, dsRatio);
                sCtx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
                sCtx.drawImage(tempCanvas, -w / 2, -h / 2);
                sCtx.restore();

                const taperRatio = 0.4;
                const centerTipX = cX + vecX;
                const centerTipY = cY + smallH/2 + vecY;

                const imgData = sCtx.getImageData(0, 0, canvasW, canvasH);
                const data = imgData.data;

                // -------------------------------------------------------------
                // [關鍵修改] 階段一：收集所有底部點進行統計分析
                // -------------------------------------------------------------
                const scanMargin = smallW; 
                const scanStartX = Math.max(0, Math.floor(cX - scanMargin));
                const scanEndX   = Math.min(canvasW, Math.floor(cX + scanMargin));

                let allFloorPoints = [];
                let globalMaxY = 0;
                let globalMinY = canvasH;

                // Pass 1: 掃描取得資料
                for (let sx = scanStartX; sx < scanEndX; sx++) {
                    for (let sy = canvasH - 1; sy >= 0; sy--) {
                        const idx = (sy * canvasW + sx) * 4;
                        if (data[idx + 3] > 50) {
                            allFloorPoints.push(sy);
                            if (sy > globalMaxY) globalMaxY = sy;
                            if (sy < globalMinY) globalMinY = sy;
                            break; // 這一行找到底就換下一行
                        }
                    }
                }

                // 計算接地閾值 (Ground Threshold)
                // 預設為全高
                let groundZoneY = 0; 

                if (allFloorPoints.length > 0) {
                    const objHeight = globalMaxY - globalMinY;
                    
                    // 1. 初步過濾：只取下半部的點作為「接地候選群」
                    // 這是為了避免「飛在空中的腿」嚴重拉低平均值
                    const candidateCutoff = globalMaxY - (objHeight * 0.5); 
                    const candidates = allFloorPoints.filter(y => y > candidateCutoff);

                    if (candidates.length > 0) {
                        // 2. 計算平均值 (Mean)
                        const sum = candidates.reduce((a, b) => a + b, 0);
                        const mean = sum / candidates.length;

                        // 3. 計算標準差 (Standard Deviation)
                        const squaredDiffs = candidates.map(val => Math.pow(val - mean, 2));
                        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / candidates.length;
                        const stdDev = Math.sqrt(avgSquaredDiff);

                        // 4. 設定閾值：平均值往上 2.5 個標準差
                        // Y軸向下是變大，所以「往上」是減去
                        // 2.5 sigma 通常能涵蓋 98% 的常態分佈，能有效保留傾斜的鞋底，同時切斷懸空物
                        groundZoneY = mean - (2.5 * stdDev);
                        
                        // console.log(`Ground Stats -> MaxY: ${globalMaxY}, Mean: ${mean.toFixed(1)}, SD: ${stdDev.toFixed(1)}, Limit: ${groundZoneY.toFixed(1)}`);
                    } else {
                        // 如果沒有候選點，回退到舊算法
                        groundZoneY = globalMaxY - (objHeight * 0.25);
                    }
                }
                // -------------------------------------------------------------

                // 清空準備繪製
                sCtx.clearRect(0, 0, canvasW, canvasH);
                sCtx.fillStyle = '#000000';
                sCtx.strokeStyle = '#000000';
                sCtx.lineWidth = 2; 
                sCtx.lineJoin = 'round';
                
                const bboxTop = cY - smallH / 2;
                const JUMP_THRESHOLD = 5;
                let prevScan = null; 

                // Pass 2: 繪圖
                for (let sx = scanStartX; sx < scanEndX; sx++) {
                    let floorY = -1;
                    let ceilY = -1;

                    // 1. 找視覺底部
                    for (let sy = canvasH - 1; sy >= 0; sy--) {
                        const idx = (sy * canvasW + sx) * 4;
                        if (data[idx + 3] > 50) {
                            floorY = sy;
                            break; 
                        }
                    }

                    if (floorY !== -1) {
                        // 2. 統計學接地過濾 (Statistical Ground Filter)
                        // 使用剛剛算出來的動態閾值
                        if (floorY < groundZoneY) {
                            prevScan = null; 
                            continue;
                        }

                        // 3. 找視覺頂部
                        ceilY = floorY;
                        for (let sy = floorY; sy >= 0; sy--) {
                             const idx = (sy * canvasW + sx) * 4;
                             if (data[idx + 3] < 10) { 
                                 ceilY = sy;
                                 break;
                             }
                        }
                        if (data[(floorY * canvasW + sx) * 4 + 3] > 50 && ceilY === floorY) ceilY = Math.max(0, bboxTop);

                        const pixelHeight = Math.abs(floorY - ceilY);
                        
                        if (pixelHeight > 1) {
                            const currentLen = pixelHeight * shadowCfg.length;

                            const currFloorX = sx;
                            const currFloorY = floorY;
                            
                            const stdEx = sx + (vecX / shadowLenBase) * currentLen;
                            const stdEy = floorY + (vecY / shadowLenBase) * currentLen;
                            
                            const currTipX = stdEx + (centerTipX - stdEx) * taperRatio;
                            const currTipY = stdEy + (centerTipY - stdEy) * taperRatio;

                            // 4. [繪製微條帶] 
                            if (prevScan) {
                                const distY = Math.abs(currFloorY - prevScan.floorY);
                                
                                if (distY < JUMP_THRESHOLD) {
                                    sCtx.beginPath();
                                    sCtx.moveTo(prevScan.floorX, prevScan.floorY);
                                    sCtx.lineTo(currFloorX, currFloorY);
                                    sCtx.lineTo(currTipX, currTipY);
                                    sCtx.lineTo(prevScan.tipX, prevScan.tipY);
                                    sCtx.closePath();
                                    sCtx.fill(); 
                                    sCtx.stroke(); 
                                }
                            }

                            prevScan = {
                                floorX: currFloorX,
                                floorY: currFloorY,
                                tipX: currTipX,
                                tipY: currTipY
                            };

                        } else {
                            prevScan = null;
                        }
                    } else {
                        prevScan = null; 
                    }
                }
                
                // 漸層
                if (shadowCfg.decay > 0) {
                    sCtx.globalCompositeOperation = 'destination-out';
                    const grad = sCtx.createLinearGradient(cX, cY, cX + vecX, cY + vecY);
                    grad.addColorStop(0, 'rgba(0,0,0,0)');
                    grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, shadowCfg.decay * 1.5)})`);
                    sCtx.fillStyle = grad;
                    sCtx.fillRect(0, 0, canvasW, canvasH);
                }
                
                // 放大貼回
                ctx.save();
                ctx.translate(centerX, centerY);
                const upscale = 1 / dsRatio;
                ctx.scale(upscale, upscale);
                
                if (shadowCfg.decay > 0) {
                     ctx.filter = `blur(${3 * scale}px)`;
                }
                
                ctx.globalAlpha = 0.6; 
                ctx.drawImage(smallCanvas, -cX, -cY);
                ctx.filter = 'none'; 
                ctx.restore();
            }

            // ============================================================
            //  3. 繪製主體
            // ============================================================
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
            ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            if (isPreview && !layerAdj.base) {
                ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
                ctx.globalCompositeOperation = 'soft-light'; 
                ctx.globalAlpha = 0.4; 
                ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
            } else {
                ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
            }
            
            ctx.restore();
        }

    } catch (err) {
        console.error("Draw Merge Error:", err);
    } finally {
        const finalCtx = image_editor_canvas.getContext('2d');
        finalCtx.drawImage(canvas, 0, 0, image_editor_canvas.width, image_editor_canvas.height);

        const finalMaskCtx = image_editor_mask_canvas.getContext('2d');
        finalMaskCtx.clearRect(0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
        if (isMaskDrawn) {
            finalMaskCtx.drawImage(maskBuffer, 0, 0, image_editor_mask_canvas.width, image_editor_mask_canvas.height);
        }

        drawMergeImageing = false;
        canvas.width = 0;
        tempCanvas.width = 0;
        maskBuffer.width = 0;
    }
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
        let uuidIdx=findUUID(image_editing_data.layer[index].uuid);
        if(uuidIdx.index>=0){
            deepImageRemove(image_editing_data.layer[index]);
            image_editing_data.layer[index]=imageClone(imageList[uuidIdx.index]);
        }else{
            alert('找不到原始圖片!');
        }

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
    let matsToProcess = [];
    const track = (mat) => { matsToProcess.push(mat); return mat; };

    let output=src.mat_clone();
    let channels = track(new cv.MatVector());
    cv.split(output, channels);

    let r = track(channels.get(0));
    let g = track(channels.get(1));
    let b = track(channels.get(2));
    let a = track(channels.get(3));
    let meanR = cv.mean(r, a)[0];
    let meanG = cv.mean(g, a)[0];
    let meanB = cv.mean(b, a)[0];
    let avgGray = (meanR + meanG + meanB) / 3;
    let scaleR = avgGray / (meanR || 0.001);
    let scaleG = avgGray / (meanG || 0.001);
    let scaleB = avgGray / (meanB || 0.001);

    r.convertTo(r, -1, scaleR, 0);
    g.convertTo(g, -1, scaleG, 0);
    b.convertTo(b, -1, scaleB, 0);

    cv.merge(channels, output);
    
    matsToProcess.forEach(m => m.delete());

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
    let matsToProcess = [];
    const track = (mat) => { matsToProcess.push(mat); return mat; };

    let output = src.mat_clone();
    let srcRGB = track(new cv.Mat());
    cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);
    let channels = track(new cv.MatVector());
    cv.split(srcRGB, channels);
    let r = track(channels.get(0));
    let g = track(channels.get(1));
    let b = track(channels.get(2));

    let ddepth = cv.CV_32F;
    let ksize = 1; 
    let scale = 1;
    let delta = 0;

    let rX = track(new cv.Mat()), rY = track(new cv.Mat());
    let gX = track(new cv.Mat()), gY = track(new cv.Mat());
    let bX = track(new cv.Mat()), bY = track(new cv.Mat());
    cv.Sobel(r, rX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(r, rY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);
    

    cv.Sobel(g, gX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(g, gY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);
    

    cv.Sobel(b, bX, ddepth, 1, 0, ksize, scale, delta, cv.BORDER_DEFAULT);
    cv.Sobel(b, bY, ddepth, 0, 1, ksize, scale, delta, cv.BORDER_DEFAULT);

    let rMag = track(new cv.Mat()), gMag = track(new cv.Mat()), bMag = track(new cv.Mat());
    
    cv.magnitude(rX, rY, rMag);
    cv.magnitude(gX, gY, gMag);
    cv.magnitude(bX, bY, bMag);

    let meanR = cv.mean(rMag)[0];
    let meanG = cv.mean(gMag)[0];
    let meanB = cv.mean(bMag)[0];

    let avgEdge = (meanR + meanG + meanB) / 3;
    

    let scaleR = avgEdge / (meanR || 0.001);
    let scaleG = avgEdge / (meanG || 0.001);
    let scaleB = avgEdge / (meanB || 0.001);

    let maxGain = 2.0; 
    let minGain = 0.5;

    scaleR = Math.max(minGain, Math.min(scaleR, maxGain));
    scaleG = Math.max(minGain, Math.min(scaleG, maxGain));
    scaleB = Math.max(minGain, Math.min(scaleB, maxGain));

    let outChannels = track(new cv.MatVector());
    cv.split(output, outChannels);
    
    track(outChannels.get(0)).convertTo(track(outChannels.get(0)), -1, scaleR, 0);
    track(outChannels.get(1)).convertTo(track(outChannels.get(1)), -1, scaleG, 0);
    track(outChannels.get(2)).convertTo(track(outChannels.get(2)), -1, scaleB, 0);
    
    cv.merge(outChannels, output);
    
    matsToProcess.forEach(m => m.delete());

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
    let matsToProcess = [];
    const track = (mat) => { matsToProcess.push(mat); return mat; };

    let output = src.mat_clone();

    let hsv = track(new cv.Mat());
    let srcRGB = track(new cv.Mat());

    cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);
    cv.cvtColor(srcRGB, hsv, cv.COLOR_RGB2HSV);
    let hsvChannels = track(new cv.MatVector());
    cv.split(hsv, hsvChannels);
    let s = track(hsvChannels.get(1));
    let v = track(hsvChannels.get(2));

    let histSize = [256];
    let ranges = [0, 255];
    let hist = track(new cv.Mat());
    let maskBrightness = track(new cv.Mat());
    let maskSaturation = track(new cv.Mat());
    let finalMask = track(new cv.Mat());
    let none = track(new cv.Mat());
    let vVec = track(new cv.MatVector()); 
    vVec.push_back(v);

    cv.calcHist(vVec, [0], none, hist, histSize, ranges);

    let totalPixels = src.rows * src.cols;
    let topPercentileCount = totalPixels * 0.01;
    let brightnessThreshold = 255;
    let currentCount = 0;

    for (let i = 255; i >= 0; i--) {
        currentCount += hist.data32F[i];
        if (currentCount >= topPercentileCount) {
            brightnessThreshold = i;
            break;
        }
    }

    cv.threshold(v, maskBrightness, brightnessThreshold, 255, cv.THRESH_BINARY);
    
    cv.threshold(s, maskSaturation, 60, 255, cv.THRESH_BINARY_INV);
    cv.bitwise_and(maskBrightness, maskSaturation, finalMask);
    let validPixels = cv.countNonZero(finalMask);
    if (validPixels < 10) { 
        finalMask.setTo(new cv.Scalar(255)); 
    }
    let meanScalar = cv.mean(srcRGB, finalMask);
    let meanR = meanScalar[0];
    let meanG = meanScalar[1];
    let meanB = meanScalar[2];

    let maxGain = 2.5;
    let minGain = 0.4;
    let avgGray = (meanR + meanG + meanB) / 3;
    let scaleR = (meanR > 1) ? (avgGray / meanR) : 1.0; 
    let scaleG = (meanG > 1) ? (avgGray / meanG) : 1.0;
    let scaleB = (meanB > 1) ? (avgGray / meanB) : 1.0;
    let maxVal = Math.max(meanR, Math.max(meanG, meanB));
    scaleR = (meanR > 1) ? (maxVal / meanR) : 1.0;
    scaleG = (meanG > 1) ? (maxVal / meanG) : 1.0;
    scaleB = (meanB > 1) ? (maxVal / meanB) : 1.0;
    scaleR = Math.max(minGain, Math.min(scaleR, maxGain));
    scaleG = Math.max(minGain, Math.min(scaleG, maxGain));
    scaleB = Math.max(minGain, Math.min(scaleB, maxGain));
    let channels = track(new cv.MatVector());
    cv.split(output, channels);
    track(channels.get(0)).convertTo(track(channels.get(0)), -1, scaleR, 0);
    track(channels.get(1)).convertTo(track(channels.get(1)), -1, scaleG, 0);
    track(channels.get(2)).convertTo(track(channels.get(2)), -1, scaleB, 0);
    cv.merge(channels, output);
    
    matsToProcess.forEach(m => m.delete());

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


function colorMatch_v2(refIndex, targetIndex) {
    let refSrc = image_editing_data.layer[refIndex].image;
    let tgtSrc = image_editing_data.layer[targetIndex].image;
    let refLab = new cv.Mat();
    cv.cvtColor(refSrc, refLab, cv.COLOR_RGBA2RGB);
    cv.cvtColor(refLab, refLab, cv.COLOR_RGB2Lab);

    let {rgb: tgtLab, alpha: tgtAlpha} = RGBA2RGB(tgtSrc);
    cv.cvtColor(tgtLab, tgtLab, cv.COLOR_RGB2Lab);

    let refChannels = new cv.MatVector();
    let tgtChannels = new cv.MatVector();
    cv.split(refLab, refChannels);
    cv.split(tgtLab, tgtChannels);

    // --- 遮罩函式保持不變 ---
    function createEdgeEnhancedMask(labMat) {
        let channels = new cv.MatVector();
        cv.split(labMat, channels);
        let L = channels.get(0);
        let rangeMask = new cv.Mat();
        cv.inRange(L, new cv.Mat(1, 1, cv.CV_8U, [40, 0, 0, 0]), new cv.Mat(1, 1, cv.CV_8U, [220, 0, 0, 0]), rangeMask);
        let gradX = new cv.Mat();
        let gradY = new cv.Mat();
        let gradAbs = new cv.Mat();
        cv.Sobel(L, gradX, cv.CV_16S, 1, 0, 3);
        cv.Sobel(L, gradY, cv.CV_16S, 0, 1, 3);
        cv.convertScaleAbs(gradX, gradX);
        cv.convertScaleAbs(gradY, gradY);
        cv.addWeighted(gradX, 0.5, gradY, 0.5, 0, gradAbs);
        let edgeMask = new cv.Mat();
        cv.threshold(gradAbs, edgeMask, 30, 255, cv.THRESH_BINARY);
        let finalMask = new cv.Mat();
        cv.bitwise_and(rangeMask, edgeMask, finalMask);
        channels.delete(); L.delete(); rangeMask.delete(); 
        gradX.delete(); gradY.delete(); gradAbs.delete(); edgeMask.delete();
        return finalMask;
    }

    let refMask = createEdgeEnhancedMask(refLab);
    let tgtMask = createEdgeEnhancedMask(tgtLab);

        let mRef = new cv.Mat();
    let sRef = new cv.Mat();
    let mTgt = new cv.Mat();
    let sTgt = new cv.Mat();

    // 1. 計算參考圖的 Mean (均值) 與 Std (標準差)
    // Lab 色彩空間中，a 和 b 代表顏色分量 (0 為無色/灰)
    
    cv.meanStdDev(refChannels.get(1), mRef, sRef, refMask); // a channel
    let muA = mRef.doubleAt(0); // 取出平均值
    let stdA = sRef.doubleAt(0);
    
    cv.meanStdDev(refChannels.get(2), mRef, sRef, refMask); // b channel
    let muB = mRef.doubleAt(0); // 取出平均值
    let stdB = sRef.doubleAt(0);
    
    // --- 原始邏輯：色彩複雜度 ---
    let colorComplexity = (stdA + stdB) / 2;

    // --- 新增邏輯：色彩飽和度 (強度) ---
    // 計算參考圖整體的平均飽和度 (距離原點的距離)
    let colorSaturation = Math.sqrt(muA * muA + muB * muB);

    /**
     * 計算混合權重 (trustFactor)
     * 1. 基礎權重：基於複雜度 (越簡單通常代表風格越強，權重越高)
     */
    let trustFactor = 1.0 - ((colorComplexity - 5) / (30 - 5));
    trustFactor = Math.max(0.2, Math.min(1.0, trustFactor)); 

    /**
     * 2. 修正權重：防止「單純色塊」造成過度染色
     * 判斷條件：如果色彩分佈很集中 (complexity < 10)，但平均顏色很鮮豔 (saturation > 20)
     * 這通常代表參考圖是「藍天」、「綠幕」或「紅牆」，而不是「濾鏡風格」。
     */
    if (colorComplexity < 15 && colorSaturation > 25) {
        console.log(`偵測到單純背景色塊 (Sat: ${colorSaturation.toFixed(2)})，降低轉換強度。`);
        // 強制降低權重，或是根據飽和度動態衰減
        trustFactor *= 0.4; 
    }

    // 確保最終權重仍在合理範圍
    trustFactor = Math.max(0.1, Math.min(1.0, trustFactor));

    console.log(`複雜度: ${colorComplexity.toFixed(2)}, 飽和度: ${colorSaturation.toFixed(2)}, 最終強度: ${trustFactor.toFixed(2)}`);

    for (let i = 0; i < 3; i++) {
        let rChan = refChannels.get(i);
        let tChan = tgtChannels.get(i);

        cv.meanStdDev(rChan, mRef, sRef, refMask);
        cv.meanStdDev(tChan, mTgt, sTgt, tgtMask);

        let muRef = mRef.doubleAt(0);
        let sigmaRef = sRef.doubleAt(0);
        let muTgt = mTgt.doubleAt(0);
        let sigmaTgt = sTgt.doubleAt(0);

        // 原本的轉換係數
        let alpha = sigmaRef / (sigmaTgt || 0.001);
        let beta = muRef - (muTgt * alpha);
        
        // --- 核心改動：加入 trustFactor 的插值 ---
        // 原公式是：New = Old * alpha + beta
        // 混合公式：Result = New * trustFactor + Old * (1 - trustFactor)
        // 整理後：Result = Old * (alpha * trustFactor + (1 - trustFactor)) + (beta * trustFactor)
        
        let adjustedAlpha = alpha * trustFactor + (1 - trustFactor);
        let adjustedBeta = beta * trustFactor;

        tChan.convertTo(tChan, -1, adjustedAlpha, adjustedBeta);
    }

    cv.merge(tgtChannels, tgtLab);
    cv.cvtColor(tgtLab, tgtLab, cv.COLOR_Lab2RGB);
    
    image_editing_data.layer[targetIndex].image = RGB2RGBA(tgtLab, tgtAlpha);

    // 釋放記憶體
    refLab.delete(); refChannels.delete(); tgtChannels.delete();
    refMask.delete(); tgtMask.delete();
    mRef.delete(); sRef.delete(); mTgt.delete(); sTgt.delete();

    drawMergeImage();
}

function resizeImageWithFace(){

}

function saveMergeImageSeamless() {
    if (!image_editing_data.layer) return;
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
    let baseMatRGBA = image_editing_data.layer[baseIndex].image.mat_clone();
    let dstRGB = new cv.Mat();
    cv.cvtColor(baseMatRGBA, dstRGB, cv.COLOR_RGBA2RGB);
    baseMatRGBA.delete();
    for (let i = 0; i < image_editing_data.layer.length; i++) {
        if (i === baseIndex) continue;

        const layerAdj = image_editing_data.adjust[i];
        
        let w = layerAdj.w;
        let h = layerAdj.h;

        let targetCenterX = layerAdj.x + w / 2;
        let targetCenterY = layerAdj.y + h / 2;

        let angle = (layerAdj.rotate ?? 0);
        let rad = angle * Math.PI / 180;
        

        let patchW = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
        let patchH = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = patchW;
        tempCanvas.height = patchH;
        const ctx = tempCanvas.getContext('2d');

        let srcMat = image_editing_data.layer[i].image;
        let assetCanvas = document.createElement('canvas');
        cv.imshow(assetCanvas, srcMat);

        ctx.save();

        ctx.translate(patchW / 2, patchH / 2);
        ctx.rotate(rad);
        ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);

        ctx.drawImage(assetCanvas, -w / 2, -h / 2, w, h);
        ctx.restore();
        

        let layerFullRGBA = cv.imread(tempCanvas);
        

        let layerVector = new cv.MatVector();
        cv.split(layerFullRGBA, layerVector);
        
        let layerRGB = new cv.Mat();
        let layerAlpha = layerVector.get(3);
        
        let tempVec = new cv.MatVector();
        tempVec.push_back(layerVector.get(0));
        tempVec.push_back(layerVector.get(1));
        tempVec.push_back(layerVector.get(2));
        cv.merge(tempVec, layerRGB);
        cv.threshold(layerAlpha, layerAlpha, 10, 255, cv.THRESH_BINARY);
        
        let center = new cv.Point(targetCenterX, targetCenterY);
        
        let clonedOutput = new cv.Mat();
        
        try {
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
        layerFullRGBA.delete();
        layerVector.delete();
        layerRGB.delete();
        layerAlpha.delete();
        tempVec.delete();
        assetCanvas = null;
    }

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


let relighting=false
function relightImage(src, lightPos, intensity = 0.5, shadowIntensity = 0.5, range = 500, smoothness = 35, half = false) {
    if(relighting) return;
    relighting=true;
    let matsToProcess = [];
    const track = (mat) => { matsToProcess.push(mat); return mat; };

    try {
        const rows = src.rows, cols = src.cols;

        // 1. 預處理法線 (稍微加強 dx, dy 的影響力，讓側面更易產生陰影)
        let grayFloat = track(new cv.Mat());
        cv.cvtColor(src, grayFloat, cv.COLOR_RGBA2GRAY);
        grayFloat.convertTo(grayFloat, cv.CV_32F, 1/255.0);
        let blurred = track(new cv.Mat());
        cv.GaussianBlur(grayFloat, blurred, new cv.Size(smoothness, smoothness), 0);
        
        let dx = track(new cv.Mat()), dy = track(new cv.Mat());
        cv.Sobel(blurred, dx, cv.CV_32F, 1, 0, 3);
        cv.Sobel(blurred, dy, cv.CV_32F, 0, 1, 3);
        
        let mag = track(new cv.Mat());
        let tx = track(new cv.Mat()), ty = track(new cv.Mat());
        cv.multiply(dx, dx, tx); cv.multiply(dy, dy, ty);
        cv.add(tx, ty, mag);
        
        let zWeight = 1.2; // 降低 Z 權重，讓法線斜度更明顯
        cv.add(mag, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(zWeight * zWeight))), mag);
        cv.sqrt(mag, mag);
        let nx = track(new cv.Mat()), ny = track(new cv.Mat()), nz = track(new cv.Mat());
        cv.divide(dx, mag, nx, -1.0); cv.divide(dy, mag, ny, -1.0);
        cv.divide(track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(zWeight))), mag, nz);

        // 2. 物理衰減計算
        let meshX = track(new cv.Mat(rows, cols, cv.CV_32F));
        let meshY = track(new cv.Mat(rows, cols, cv.CV_32F));
        for(let r=0; r<rows; r++) {
            let rx = meshX.floatPtr(r), ry = meshY.floatPtr(r);
            for(let c=0; c<cols; c++) { rx[c] = c; ry[c] = r; }
        }
        let lx = track(new cv.Mat()), ly = track(new cv.Mat()), lz = track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(lightPos.z)));
        cv.subtract(track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(lightPos.x))), meshX, lx);
        cv.subtract(track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(lightPos.y))), meshY, ly);
        let dist = track(new cv.Mat());
        cv.multiply(lx, lx, tx); cv.multiply(ly, ly, ty); cv.add(tx, ty, dist);
        let lz2 = track(new cv.Mat()); cv.multiply(lz, lz, lz2); cv.add(dist, lz2, dist);
        cv.sqrt(dist, dist);
        cv.divide(lx, dist, lx); cv.divide(ly, dist, ly); cv.divide(lz, dist, lz);

        let atten = track(new cv.Mat());
        let rangeMat = track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(range)));
        cv.divide(dist, rangeMat, atten);
        cv.multiply(atten, atten, atten);
        let ones = track(cv.Mat.ones(rows, cols, cv.CV_32F));
        cv.add(atten, ones, atten);
        cv.divide(ones, atten, atten); // atten 0~1

        // 3. 計算點積與混合 Mask
        let dot = track(new cv.Mat());
        cv.multiply(nx, lx, tx); cv.multiply(ny, ly, ty); cv.add(tx, ty, dot);
        let tz = track(new cv.Mat()); cv.multiply(nz, lz, tz); cv.add(dot, tz, dot);

        if (half) {
            cv.multiply(dot, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(0.5))), dot);
            cv.add(dot, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(0.5))), dot);
        }

        // 4. 建立亮部 Mask 與 暗部 Mask
        // 我們將基準點設在 0.7，這樣低於 0.7 的受光面都會產生陰影感
        let lightMask = track(new cv.Mat());
        let shadowMask = track(new cv.Mat());
        
        let threshold = 0.7; 
        cv.subtract(dot, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(threshold))), lightMask);
        cv.multiply(lightMask, atten, lightMask);
        cv.threshold(lightMask, lightMask, 0, 0, cv.THRESH_TOZERO); // 只留正值作為亮部
        cv.multiply(lightMask, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(intensity))), lightMask);

        cv.subtract(track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(threshold))), dot, shadowMask);
        cv.multiply(shadowMask, atten, shadowMask);
        cv.threshold(shadowMask, shadowMask, 0, 0, cv.THRESH_TOZERO); // 只留正值作為暗部
        cv.multiply(shadowMask, track(new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(shadowIntensity))), shadowMask);

        // 5. 混合應用
        let srcFloat = track(new cv.Mat());
        src.convertTo(srcFloat, cv.CV_32FC4, 1/255.0);
        let channels = new cv.MatVector();
        cv.split(srcFloat, channels);

        for (let i = 0; i < 3; i++) {
            let chan = track(channels.get(i));
            
            // A. 暗部：使用 Multiply (相乘) -> 讓陰影絕對有效
            // Formula: Chan = Chan * (1 - shadowMask)
            let sInv = track(new cv.Mat());
            cv.subtract(ones, shadowMask, sInv);
            cv.multiply(chan, sInv, chan);

            // B. 亮部：使用 Screen (濾色) -> 絕對不會過曝炸裂
            // Formula: Chan = 1 - (1 - Chan) * (1 - lightMask)
            let cInv = track(new cv.Mat());
            let lInv = track(new cv.Mat());
            cv.subtract(ones, chan, cInv);
            cv.subtract(ones, lightMask, lInv);
            cv.multiply(cInv, lInv, chan);
            cv.subtract(ones, chan, chan);
        }
        
        let result = new cv.Mat();
        cv.merge(channels, result);
        result.convertTo(result, cv.CV_8U, 255.0);
        channels.delete();
        return result;

    } finally {
        matsToProcess.forEach(m => m.delete());
        relighting=false;
    }
}

function updateRelightData(relight=true){
    if(!relight){
        document.getElementById('relight-z').value=image_editing_data.z;
        document.getElementById('relight-range').value=image_editing_data.range;
        document.getElementById('relight-intensity').value=image_editing_data.intensity;
        document.getElementById('relight-shadowIntensity').value=image_editing_data.shadowIntensity;
        document.getElementById('relight-smooth').value=image_editing_data.smoothness;
        document.getElementById('relight-half').checked=image_editing_data.half;
        return;
    }
    let light={
        x:image_editing_data.x,
        y:image_editing_data.y,
        z:image_editing_data.z,
    }
    let output=relightImage(image_editing_data.img.image, light, image_editing_data.intensity, image_editing_data.shadowIntensity, image_editing_data.range, image_editing_data.smoothness, image_editing_data.half);
    if(output){
        cv.imshow(image_editor_canvas, output);
        output.delete();
    }
}

function saveRelightImage(){
    updateRelightData();

    let output = cv.imread(image_editor_canvas);

    imageList.push({
        name: "relight_"+image_editing_data.img.name,
        image: output,
        uuid: uuid(),
        type: TYPE.ORIGIN,
        height: image_editing_data.img.height,
        width: image_editing_data.img.width,
    });
    fileUpdate();
}
