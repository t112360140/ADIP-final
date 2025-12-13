
const TYPE={
    ORIGIN: 0,
    OBJECT: 1,
    BACKGROUND: 2,
    MASK: 3,
}

var imageList=[]

const imageInput=document.getElementById('image-input');
imageInput.addEventListener('change', ()=>{
    if(window.cvReady){
        if(imageInput.files){
            let counter=0;
            for(let i=0;i<imageInput.files.length;i++){
                const file=imageInput.files[i];
                const reader=new FileReader();
                reader.onload=()=>{
                    const image=new Image();
                    image.src=reader.result;
                    image.onload=async function(){
                        cv = (cv instanceof Promise) ? await cv : cv;
                        let mat = cv.imread(imgElement);

                        imageList.push({
                            name: file.name,
                            image: mat,
                            uuid: uuid(),
                            type: TYPE.ORIGIN,
                        });

                        if(++counter==imageInput.files.length){
                            imageInput.value='';
                            fileUpdate();
                        }
                    }
                }
                reader.readAsDataURL(file);
            }
        }
    }else{
        alert("openCV還未準備好");
    }
});

function canvas2image(data){
    const canvas=document.createElement('canvas');
    canvas.height=data.height;
    canvas.width=data.width;
    const ctx=canvas.getContext('2d');
    ctx.putImageData(data, 0, 0);

    return canvas.toDataURL("image/png");
}

function downloadCanvas(data){
    canvasData=data.data;
    const canvas=document.createElement('canvas');
    canvas.height=canvasData.height;
    canvas.width=canvasData.width;
    const ctx=canvas.getContext('2d');
    ctx.putImageData(canvasData, 0, 0);

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
            <img src="${canvas2image(data.data)}" style="max-height:150px;max-width:150px;"><br>
            <span>${data.name}</span>
            <div>
                <span style="text-decoration: underline;cursor: pointer;color: green;" onclick="downloadCanvas(imageList[${i}]);">下載</span>
                <span style="text-decoration: underline;cursor: pointer;color: red;" onclick="if(confirm('確認刪除?')){imageList[${i}]=null; imageList=imageList.filter((v)=>(v!=null)); fileUpdate();}">刪除</span>
            </div>
        </div>`
    }

    previewImage.innerHTML=html;
}

function uuid(length=8){
    const str='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxtz';
    return (new Array(length).fill(0).map((v)=>(str[Math.floor(Math.random()*str.length)]))).join('');
}