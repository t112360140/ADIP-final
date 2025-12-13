
const TYPE={
    ORIGIN: 0,
    OBJECT: 1,
    BACKGROUND: 2,
    MASK: 3,
}

var imageList=[]

const imageInput=document.getElementById('image-input');
imageInput.addEventListener('change', async()=>{
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
                        let mat = cv.imread(imgElement);

                        imageList.push({
                            name: file.name,
                            image: mat,
                            uuid: uuid(),
                            type: TYPE.ORIGIN,
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
    }
});

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
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="downloadMat(imageList[${i}]);">下載</span>
                <span style="text-decoration: underline;cursor: pointer;color: red;" onclick="if(confirm('確認刪除?')){if(imageList[${i}].image){imageList[${i}].image.delet();};imageList[${i}]=null; imageList=imageList.filter((v)=>(v!=null)); fileUpdate();}">刪除</span>
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