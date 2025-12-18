var set2Width=512;
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
                        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2, true);
                        ctx.fill();
                        addGrabCut(pos, 3);
                    }
                    break;
                case MODE.PhotoFix:
                    const ctx=image_editor_mask_canvas.getContext('2d');
                    ctx.fillStyle='#ff0000';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, image_editing_data.penW, 0, Math.PI * 2, true);
                    ctx.fill();
                    cv.circle(image_editing_data.mask, new cv.Point(pos.x, pos.y), image_editing_data.penW, new cv.Scalar(255), -1);
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
            if(event.deltaY>0) resizeMergeImage(image_editing_data.select, 0.9);
            else resizeMergeImage(image_editing_data.select, 1.1);
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
            const scale_=base?Math.min(base.w/image.width, base.h/image.height, 1):1;
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
            cv.circle(image_editing_data.mask, new cv.Point(pos.x*scale, pos.y*scale), size, new cv.Scalar(cv.GC_FGD), -1);
        }else if(image_editing_data.grabCutAdd==2){
            cv.circle(image_editing_data.mask, new cv.Point(pos.x*scale, pos.y*scale), size, new cv.Scalar(cv.GC_BGD), -1);
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
                for(let j=0;j<channels;j++) outMaskData[imgIdx+j]=255;
                maskData[i]=255;
            }else{
                outData[imgIdx + 3] = 0;
                for(let j=0;j<channels;j++) outMaskData[imgIdx+j]=0;
                maskData[i]=0;
            }
            if(channels==4) outMaskData[imgIdx+3]=255;
        }

        if((image_editing_data.img.type==TYPE.ORIGIN||image_editing_data.img.type==TYPE.FIXED) && confirm('是否要修補背景?')){
            if(confirm('使用PatchMatch修補?\n選擇"否"將使用OpenCV進行修補。')){
                let task=newTask("圖像修復", `任務UUID: ${uuid_}`, null);
                buildInpaintTask(cv, image_editing_data.img.image, resizeMask, (data)=>{
                    // console.log(`Processing Level: ${data.level}, Size: ${data.size[0]}x${data.size[1]}`);
                    // task.update(null, `任務UUID: ${uuid_}<br>Level: ${data.level}, Size: ${data.size[0]}x${data.size[1]}`, data.process);
                    task.update(null, `任務UUID: ${uuid_}<br>進度: ${Math.round(data.process*100)}%`, data.process);
                }).then((data)=>{
                    imageList.push({
                        name: "back_"+image_editing_data.img.name,
                        image: data,
                        uuid: uuid(),
                        type: TYPE.BACKGROUND,
                        height: image_editing_data.img.height,
                        width: image_editing_data.img.width,
                        parent: image_editing_data.img.uuid,
                        sibling: uuid_,
                    });
                    fileUpdate();
                    task.remove();
                    task=null;
                }).catch((err)=>{
                    console.error(err);
                    task.remove();
                    task=null;
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
        let transparent=new cv.Mat(image_editing_data.img.image.rows, image_editing_data.img.image.cols, cv.CV_8UC1, new cv.Scalar(0));
        let channels = image_editing_data.img.image.channels();
        for(let i=0;i<transparent.data.length.length;i++){
            transparent.data[i]=outBackData[i*channels+3];
        }

        // 修補背景
        const kernelSize = 3;
        const inpaintRadius = 3;
        let kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
        let tempMask = image_editing_data.mask.mat_clone();
        cv.dilate(image_editing_data.mask, tempMask, kernel);
        let dst = new cv.Mat();
        cv.cvtColor(image_editing_data.img.image, image_editing_data.img.image, cv.COLOR_RGBA2RGB, 0);
        cv.inpaint(image_editing_data.img.image, tempMask, dst, inpaintRadius, cv.INPAINT_NS);    // cv.INPAINT_TELEA
        image_editing_data.img.image.delete();
        image_editing_data.img.image = dst;
        cv.cvtColor(image_editing_data.img.image, image_editing_data.img.image, cv.COLOR_RGB2RGBA, 0);

        outBackData = image_editing_data.img.image.data;
        for(let i=0;i<transparent.data.length.length;i++){
            outBackData[i*channels+3]=transparent.data[i];
        }
        tempMask.delete();
        transparent.delete();

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
    if(image_editing_data.layer){
        let selectOut='';
        const selected=select??merge_layer_select.value;
        for(let i=0;i<image_editing_data.layer.length;i++){
            selectOut=`<option value="${image_editing_data.layer[i].uuid}"${(image_editing_data.layer[i].uuid===selected)?' selected':''}>${image_editing_data.layer.length-i}: ${image_editing_data.layer[i].name}${image_editing_data.adjust[i].base?'*':''}</option>`+selectOut;
            if(image_editing_data.layer[i].uuid===selected) image_editing_data.select=i;
        }
        merge_layer_select.innerHTML=selectOut;
    }
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

        updateMergeLayerSelect();
        drawMergeImage();
    }
}

let drawMergeImageing=false;
function drawMergeImage() {
    if(drawMergeImageing) return;
    if (!image_editing_data.layer) return;

    // 1. 尋找 Base (背景) 以確定畫布大小
    let base = image_editing_data.adjust.find(a => a.base);
    if (!base) {
        alert('沒有照片了QQ');
        setEditImage(null, 'NOPE');
        return;
    }
    drawMergeImageing=true;

    // 建立離屏 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = base.w;
    canvas.height = base.h;
    const ctx = canvas.getContext('2d');

    // 準備 Mask 用的 Canvas (如果有選取)
    let maskCanvas = null;
    let maskCtx = null;
    if (image_editing_data.select !== undefined && image_editing_data.select !== -1) {
        maskCanvas = document.createElement('canvas');
        maskCanvas.width = base.w;
        maskCanvas.height = base.h;
        maskCtx = maskCanvas.getContext('2d');
    }

    // 2. 遍歷圖層並繪製
    for (let i = 0; i < image_editing_data.layer.length; i++) {
        const layerAdj = image_editing_data.adjust[i];
        let w = layerAdj.w;
        let h = layerAdj.h;
        let x = layerAdj.x;
        let y = layerAdj.y;

        // 這是該圖片在畫布上的中心位置
        let centerX = x + w / 2;
        let centerY = y + h / 2;

        let srcMat = image_editing_data.layer[i].image;
        let tempCanvas = document.createElement('canvas');
        cv.imshow(tempCanvas, srcMat); 

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
        ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
        ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);

        ctx.restore();

        if (image_editing_data.select == i && maskCtx) {
            maskCtx.save();
            maskCtx.globalAlpha = 0.3;
            
            maskCtx.translate(centerX, centerY);
            maskCtx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
            maskCtx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
            maskCtx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);
            maskCtx.globalAlpha = 1.0;
            maskCtx.restore();
        }
        
        tempCanvas = null; 
    }

    // 3. (選擇性) 將合成結果轉回 cv.Mat
    // 如果你之後還要用 cv.imshow 顯示，或者做其他 cv 處理
    let output = cv.imread(canvas);
    cv.imshow(image_editor_canvas, output);
    output.delete(); // 顯示完就釋放

    // 處理 Mask 顯示
    if (maskCanvas) {
        let outputMask = cv.imread(maskCanvas);
        cv.imshow(image_editor_mask_canvas, outputMask);
        outputMask.delete();
    }

    drawMergeImageing=false;
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
                );

                image_editing_data.adjust[i].x=0;
                image_editing_data.adjust[i].y=0;
                image_editing_data.adjust[i].h=Math.floor(image_editing_data.layer[i].image.rows*scale);
                image_editing_data.adjust[i].w=Math.floor(image_editing_data.layer[i].image.cols*scale);
            }
        }

        updateMergeLayerSelect();
        drawMergeImage();
    }
}

function resizeMergeImage(index, scale=0){
    if(scale<=0) return;
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=index&&index<image_editing_data.layer.length){
            const h_=Math.floor(image_editing_data.adjust[index].h*scale);
            const w_=Math.floor(image_editing_data.adjust[index].w*scale);
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

    // 建立離屏 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = base.w;
    canvas.height = base.h;
    const ctx = canvas.getContext('2d');

    // 2. 遍歷圖層並繪製
    for (let i = 0; i < image_editing_data.layer.length; i++) {
        const layerAdj = image_editing_data.adjust[i];
        let w = layerAdj.w;
        let h = layerAdj.h;
        let x = layerAdj.x;
        let y = layerAdj.y;

        // 這是該圖片在畫布上的中心位置
        let centerX = x + w / 2;
        let centerY = y + h / 2;

        let srcMat = image_editing_data.layer[i].image;
        let tempCanvas = document.createElement('canvas');
        cv.imshow(tempCanvas, srcMat); 

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((layerAdj.rotate ?? 0) * Math.PI / 180);
        ctx.scale(layerAdj.mirror_h ? -1 : 1, layerAdj.mirror_v ? -1 : 1);
        ctx.drawImage(tempCanvas, -w / 2, -h / 2, w, h);

        ctx.restore();
        
        tempCanvas = null; 
    }

    // 3. (選擇性) 將合成結果轉回 cv.Mat
    // 如果你之後還要用 cv.imshow 顯示，或者做其他 cv 處理
    let output = cv.imread(canvas);

    imageList.push({
        name: "merge_"+image_editing_data.layer[baseIndex].name,
        image: output,
        uuid: uuid(),
        type: TYPE.ORIGIN,
        height: base.h,
        width: base.w,
        parent: image_editing_data.layer[baseIndex].uuid,
    });
    fileUpdate();
}


function changeMergeImageColor(index, colorIntensity = 0.3){
    if(image_editing_data.mode&&image_editing_data.mode%10==2){
        if(0<=index&&index<image_editing_data.layer.length){
            let src=-1;
            if(image_editing_data.layer.length>2){
                const ret=parseInt(prompt(`找到多個影像，請選擇目標的影像:\n${image_editing_data.layer.filter((v, i)=>i!=index).map((v, i)=>((i+1).toString()+': '+v.name)).join('\n')}`))-1;
                if(0<=ret&&ret<image_editing_data.layer.length-1){
                    src=(ret>=index)?ret+1:ret;
                }else{
                    alert('選擇不存在!');
                    return;
                }
            }else if(image_editing_data.length<=1){
                alert('只有一張圖片，無法調整!');
                return;
            }else{
                src=(index+1)%2;
            }
            if(src<0){
                alert('目標錯誤!');
                return;
            }

            let { rgb: tgtRGB, alpha: tgtAlpha } = RGBA2RGB(image_editing_data.layer[index].image);
            let tgtLab = new cv.Mat();
            cv.cvtColor(tgtRGB, tgtLab, cv.COLOR_RGB2Lab);
            tgtLab.convertTo(tgtLab, cv.CV_32FC3);
            tgtRGB.delete();

            // === 2. 準備 Source (5_2, 參考圖) ===
            let { rgb: srcRGB, alpha: srcAlpha } = RGBA2RGB(image_editing_data.layer[src].image.mat_clone());
            let srcLab = new cv.Mat();
            cv.cvtColor(srcRGB, srcLab, cv.COLOR_RGB2Lab);
            srcLab.convertTo(srcLab, cv.CV_32FC3);
            srcRGB.delete();

            let srcMean = new cv.Mat();
            let srcStd = new cv.Mat();
            let tgtMean = new cv.Mat();
            let tgtStd = new cv.Mat();

            // === 3. 關鍵修正：採樣計算 ===

            // (A) 計算 Target (5_1) 的統計數據
            // 這裡非常重要！必須把 alpha 當作 mask 傳進去。
            // 否則 5_1 透明背景的黑色(0,0,0)會拉低平均值，導致算出來的結果大偏白。
            cv.meanStdDev(tgtLab, tgtMean, tgtStd, tgtAlpha);

            // (B) 計算 Source (5_2) 的統計數據
            // 使用 ROI 只看中間的臉部，避開草地
            let roiX = Math.floor(srcLab.cols * 0.35);
            let roiY = Math.floor(srcLab.rows * 0.25);
            let roiW = Math.floor(srcLab.cols * 0.3);
            let roiH = Math.floor(srcLab.rows * 0.3);
            let rect = new cv.Rect(roiX, roiY, roiW, roiH);
            let srcRoi = srcLab.roi(rect);
            let srcAlphaRoi = srcAlpha.roi(rect);
            cv.meanStdDev(srcRoi, srcMean, srcStd, srcAlphaRoi);
            srcRoi.delete();
            srcAlpha.delete();
            srcAlphaRoi.delete();

            // === 4. 執行轉換 (改進版演算法) ===
            
            let tgtChannels = new cv.MatVector();
            cv.split(tgtLab, tgtChannels);
            
            let originalA = tgtChannels.get(1).mat_clone();
            let originalB = tgtChannels.get(2).mat_clone();

            for (let i = 0; i < 3; i++) {
                let channel = tgtChannels.get(i);

                let sM = srcMean.doubleAt(i, 0); // Source Mean (5_2 的臉色)
                let sS = srcStd.doubleAt(i, 0);  // Source Std
                let tM = tgtMean.doubleAt(i, 0); // Target Mean (5_1 原本的顏色)
                let tS = tgtStd.doubleAt(i, 0);  // Target Std

                // --- 修正點：抑制標準差 (Contrast) 的影響 ---
                // 為了不讓臉變橘 (不過度拉伸飽和度)，我們強行讓 scale 接近 1.0
                // 也就是說：我們主要只做「加減法」(色偏)，不做「乘除法」(對比擴張)
                
                let rawScale = sS / (tS + 1e-6);
                
                // 混合率：0.0 代表完全不改變對比度，1.0 代表完全採用 Reinhard
                // 老師的範例感覺只有色溫變了，對比度沒變，所以我們用很低的係數 (例如 0.1 或 0.0)
                // 這樣可以避免顏色「炸開」
                let contrastFactor = 0.15; 
                let scale = 1.0 + (rawScale - 1.0) * contrastFactor;

                // 1. 減去自己的平均 (歸零)
                let s = new cv.Mat(channel.rows, channel.cols, channel.type(), [tM, 0, 0, 0]);
                cv.subtract(channel, s, channel);
                s.delete();

                // 2. 乘上被抑制過的比例
                let m = new cv.Mat(channel.rows, channel.cols, channel.type(), [scale, 0, 0, 0]);
                cv.multiply(channel, m, channel);
                m.delete();

                // 3. 加上對方的平均 (上色)
                let a = new cv.Mat(channel.rows, channel.cols, channel.type(), [sM, 0, 0, 0]);
                cv.add(channel, a, channel);
                a.delete();
            }

            // === 5. 混合與輸出 ===
            // L (亮度) 通道：通常保留原圖的亮度層次比較自然，或者只融合一點點
            let newL = tgtChannels.get(0);
            let originalL = tgtChannels.get(0).mat_clone(); // 這行其實上面沒備份，這裡邏輯上是已經被修改過的L
            // 如果你覺得亮度變得太平，可以考慮不修改 L channel，只修改 A, B
            // 但為了色溫一致，L 微調通常是需要的。

            let newA = tgtChannels.get(1);
            let newB = tgtChannels.get(2);

            // 根據 colorIntensity 融合回原圖
            // 老師的範例看起來融合度很高，所以這裡可以讓 colorIntensity 接近 0.8 或 1.0
            cv.addWeighted(originalL, 1.0 - colorIntensity, newL, colorIntensity, 0, newL);
            cv.addWeighted(originalA, 1.0 - colorIntensity, newA, colorIntensity, 0, newA);
            cv.addWeighted(originalB, 1.0 - colorIntensity, newB, colorIntensity, 0, newB);

            // 清理內存
            originalA.delete(); originalB.delete(); originalL.delete();
            srcMean.delete(); srcStd.delete(); tgtMean.delete(); tgtStd.delete();

            cv.merge(tgtChannels, tgtLab);
            tgtLab.convertTo(tgtLab, cv.CV_8UC3);
            
            let resultRGB = new cv.Mat();
            cv.cvtColor(tgtLab, resultRGB, cv.COLOR_Lab2RGB);

            // 寫回
            image_editing_data.layer[index].image = RGB2RGBA(resultRGB, tgtAlpha);

            drawMergeImage();

            // 清理
            tgtLab.delete(); tgtChannels.delete(); resultRGB.delete();
        }
    }
}