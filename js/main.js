
const TYPE={
    ORIGIN: 0,
    OBJECT: 1,
    BACKGROUND: 2,
    MASK: 3,
}

var imageList=[]

var cvReady=false;
const opencv_info=document.getElementById('opencv-info');
async function openCVReady(){
    cvReady=true;
    cv = (cv instanceof Promise) ? await cv : cv;

    opencv_info.innerHTML='openCV.js 準備好了!!';
    imageInput.disabled=false;
}

const imageInput=document.getElementById('image-input');
imageInput.addEventListener('change', async()=>{
    try{
        if(window.cvReady){
            if(imageInput.files){
                for(let i=0;i<imageInput.files.length;i++){
                    const file=imageInput.files[i];
                    await addImageToList(file.name, file);
                }
                imageInput.value='';
                fileUpdate();
            }
        }else{
            alert("openCV還未準備好");
            imageInput.value='';
        }
    }catch(e){
        alert("錯誤!");
        imageInput.value='';
    }
});

const exampleList=[
    '1_1.jpg', '1_2.jpg',
    '2_1.jpg', '2_2.jpg',
    '3_1.png', '3_2.png',
    '4_1.jpg', '4_2.jpg',
    '5_1.jpg', '5_2.jpg',
    '6_1.jpg', '6_2.jpg',
    '7_1.jpg', '7_2.jpg',
    '8_1.jpg', '8_2.jpg',
];
async function loadExample(){
    if(window.cvReady){
        let task=newTask('下載範例', `進度: 0/${exampleList.legth}`);
        for(let i=0;i<exampleList.length;i++){
            const name=exampleList[i];
            const url=`dataset/${name}`;
            const req=await fetch(url);
            if(req.ok){
                await addImageToList(name, await req.blob())
            }
            task.update(null, `進度: ${i+1}/${exampleList.legth}`, (i+1)/exampleList.legth);
        }
        fileUpdate();
        task.remove();
        task=null;
    }
}

function downloadMat(data){
    const canvas=document.createElement('canvas');
    cv.imshow(canvas, data.image);

    canvas.toBlob((blob)=>{
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=data.name;
        a.click();
        setTimeout(()=>{URL.revokeObjectURL(a.href)}, 5000);
    }, 'image/png');
}

function imageClone(data){
    if (data === null || data === undefined || typeof data !== 'object')  {
        return data;
    }
    if (data instanceof Array) {
        var cloneA = [];
        for (var i = 0; i < data.length; ++i) {
            cloneA[i] = imageClone(data[i]);
        }
        return cloneA;
    }
    if(data instanceof cv.Mat){
        return data.mat_clone();
    }
    var cloneO = {};
    for (var i in data) {
        cloneO[i] = imageClone(data[i]);
    }                  
    return cloneO;
}

function deepImageRemove(data){
    if (data === null || data === undefined || typeof data !== 'object') return;
    if(data instanceof cv.Mat){
        try{data.delete();}catch(e){console.warn('刪除Mat錯誤',e);}
        return;
    }
    if (data instanceof Array) {
        for (var i = 0; i < data.length; ++i) deepImageRemove(data[i]);
        return;
    }
    for (var i in data) deepImageRemove(data[i]);
    return;
}

async function addImageToList(name, blob){
    const image=new Image();
    image.src=URL.createObjectURL(blob);
    await new Promise((r)=>{
        image.onload=async function(){
            let mat = cv.imread(image);

            imageList.push({
                name: name,
                image: mat,
                uuid: uuid(),
                type: TYPE.ORIGIN,
                height: image.height,
                width: image.width,
            });

            r();
        }
    });
    URL.revokeObjectURL(image.src);
}

function removeImageFromList(index){
    if(index<0&&imageList<=index) return;
    const sibling=findUUID(imageList[index].sibling).sibling;
    if(sibling.length>0){
        for(let i=0;i<sibling.length;i++){
            if(imageList[sibling[i].index].image instanceof cv.Mat) imageList[sibling[i].index].image.delete();
            imageList[sibling[i].index]=null;
        }
    }else{
        if(imageList[index].image instanceof cv.Mat) imageList[index].image.delete();
        imageList[index]=null;
    }
    imageList=imageList.filter(v=>v!==null);

    fileUpdate();
}

function findUUID(uuid){
    let index=-1;
    let child=[];
    let sibling=[];
    for(let i=0;i<imageList.length;i++){
        if(imageList[i].uuid==uuid) index=i;
        if(imageList[i].parent==uuid) child.push({index: i, data: imageList[i]});
        if(imageList[i].sibling==uuid) sibling.push({index: i, data: imageList[i]});
    }
    return {
        index: index,
        child: child,
        sibling: sibling,
    };
}

// function getUUIDTree(){
//     let 
// }

const previewImage=document.getElementById('preview-image');
function fileUpdate(){
    let html="";
    imageList=imageList.sort((a, b)=>(a.name>b.name?1:-1));
    for(let i=0;i<imageList.length;i++){
        const data=imageList[i];
        html+=`<div style="background: #A0A0A0;padding:10px;margin: 5px;display: flex;flex-direction: column;align-items: center;">
            <canvas id="image-preview-${data.uuid}" onclick="setEditImage(imageList[${i}], 'View');" style="max-height:150px;max-width:150px;" title="UUID: ${data.uuid}\nParent: ${data.parent}\nSibling: ${data.sibling}\nHeight: ${data.height}\nWidth: ${data.width}"></canvas><br>
            <span>${data.name}</span>
            <div style="border: 2px solid black;padding: 3px;">
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'GrabCut');" title="使用方塊標記要選取的物件">方框選取</span>
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'GrabCutPen');" title="使用畫筆標記要選取的物件">畫筆選取</span><br>
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'GrabCutAuto');" title="從影像(10, 10, width-10, height-10) 中找出物件">自動選取</span>
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'GrabCutPeople');" title="使用人臉找出物件">人物選取</span>
            </div>
            <div style="border: 2px solid black;padding: 3px;">
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'Merge');" title="檢查是否有分解過的影像，並且新增">合併影像</span>
                <span style="text-decoration: underline;cursor: pointer;color: blue;" onclick="setEditImage(imageList[${i}], 'MergeSingle');" title="直接新增影像">合併影像(單獨)</span>
            </div>
            <div style="border: 2px solid black;padding: 3px;">
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="downloadMat(imageList[${i}]);">下載</span>
                <span style="text-decoration: underline;cursor: pointer;color: red;" onclick="${(data.sibling)?"if(confirm('前景、遮罩、背景都會被刪除!\\n確認刪除?')){removeImageFromList("+i+");}":"if(confirm('確認刪除?')){removeImageFromList("+i+");}"}">刪除</span>
            </div>
        </div>`
    }

    previewImage.innerHTML=html;

    setTimeout(()=>{
        for(let i=0;i<imageList.length;i++){
            try{
                const data=imageList[i];
                cv.imshow(`image-preview-${data.uuid}`, data.image);
            }catch(e){}
        }
    }, 100);
}

function uuid(length=8){
    const str='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxtz';
    return (new Array(length).fill(0).map((v)=>(str[Math.floor(Math.random()*str.length)]))).join('');
}
