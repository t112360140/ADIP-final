
const TYPE={
    ORIGIN: 0,
    OBJECT: 1,
    BACKGROUND: 2,
    MASK: 3,
}

var imageList=[]

var cvReady=false;
const opencv_info=document.getElementById('opencv-info');
function openCVReady(){
    cvReady=true;

    opencv_info.innerHTML='openCV.js 準備好了!!';
    imageInput.disabled=false;
}

const imageInput=document.getElementById('image-input');
imageInput.addEventListener('change', async()=>{
    try{
        if(window.cvReady){
            if(imageInput.files){
                let counter=0;
                for(let i=0;i<imageInput.files.length;i++){
                    const file=imageInput.files[i];
                    const image=new Image();
                    image.src=URL.createObjectURL(file);
                    await new Promise((r)=>{
                        image.onload=async function(){
                            cv = (cv instanceof Promise) ? await cv : cv;
                            let mat = cv.imread(image);
                            cv.cvtColor(mat, mat, cv.COLOR_RGBA2RGB, 0);

                            imageList.push({
                                name: file.name,
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
        for(let i=0;i<exampleList.length;i++){
            const name=exampleList[i];
            const url=`dataset/${name}`;
            const req=await fetch(url);
            if(req.ok){
                const image=new Image();
                image.src=URL.createObjectURL(await req.blob());
                await new Promise((r)=>{
                    image.onload=async function(){
                        cv = (cv instanceof Promise) ? await cv : cv;
                        let mat = cv.imread(image);
                        cv.cvtColor(mat, mat, cv.COLOR_RGBA2RGB, 0);

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
        }
        fileUpdate();
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

function removeImageFromList(index){
    if(index<0&&imageList<=index) return;
    if(imageList[index].image instanceof cv.Mat) imageList[index].image.delect();
    imageList[index]=null;
    imageList=imageList.filter(v=>v!==null);

    fileUpdate();
}

const previewImage=document.getElementById('preview-image');
function fileUpdate(){
    let html="";
    imageList=imageList.sort((a, b)=>(a.name>b.name?1:-1));
    for(let i=0;i<imageList.length;i++){
        const data=imageList[i];
        html+=`<div style="background: #A0A0A0;padding:10px;margin: 5px;display: flex;flex-direction: column;align-items: center;">
            <canvas id="image-preview-${data.uuid}" style="max-height:150px;max-width:150px;"></canvas><br>
            <span>${data.name}</span>
            <div>
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="setEditImage(imageList[${i}], 'GrabCut');">手動切割</span>
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="setEditImage(imageList[${i}], 'GrabCutAuto');">自動切割</span>
            </div>
            <div>
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="downloadMat(imageList[${i}]);">下載</span>
                <span style="text-decoration: underline;cursor: pointer;color: red;" onclick="if(confirm('確認刪除?')){removeImageFromList(${i});}">刪除</span>
            </div>
        </div>`
    }

    previewImage.innerHTML=html;

    setTimeout(()=>{
        for(let i=0;i<imageList.length;i++){
            const data=imageList[i];
            cv.imshow(`image-preview-${data.uuid}`, data.image);
        }
    }, 100);
}

function uuid(length=8){
    const str='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxtz';
    return (new Array(length).fill(0).map((v)=>(str[Math.floor(Math.random()*str.length)]))).join('');
}