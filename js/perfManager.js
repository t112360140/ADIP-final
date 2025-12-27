let perf_board;
let perf_board_button;
let perf_board_clear_button;

let perf_list=[];
let MAX_PERF_COUNT=50;

function newPerf(name='APPLE', detail=""){
    if(perf_board){
        if(perf_list.length>MAX_PERF_COUNT){
            for(let i=0;i<perf_list.length;i++){
                if(perf_list[i].end!=null){
                    perf_list[i].remove();
                    break;
                }
            }
        }
        const div=document.createElement('div');
        div.style.cssText='width:250px;border: 1px solid black;margin-bottom:3px;box-sizing: border-box;display: flex;flex-direction: column;justify-content: space-between;';
        const element_name=document.createElement('span');
        element_name.style.cssText='font-size:1.2em;';
        element_name.innerHTML=name;
        div.append(element_name);
        const element_detail=document.createElement('span');
        element_detail.innerHTML=detail;
        div.append(element_detail);
        const timer=document.createElement('span');
        timer.innerHTML='00:00.000';
        div.append(timer);

        let data={
            uuid: uuid(),
            name: name,
            detail: detail,
            start: new Date().getTime(),
            end: null,
            element:{
                div: div,
                name:element_name,
                detail:element_detail,
                timer: timer,
            },
            update:function(name, detail){
                if(name!=null){
                    this.name=name;
                    this.element.name.innerHTML=this.name;
                }
                if(detail!=null){
                    this.detail=detail;
                    this.element.detail.innerHTML=this.detail;
                }
                if(this.end==null) this.element.timer.innerHTML=getTimeDiff(this.start);
            },
            stop:function(){
                this.end=new Date().getTime();
                this.element.timer.innerHTML=`總共花費: ${this.end-this.start}ms`;
            },
            remove:function(){
                if(this.element)
                    perf_board.removeChild(this.element.div)
                for(let i=0;i<perf_list.length;i++){
                    if(perf_list[i].uuid==this.uuid){
                        perf_list[i]=null;
                        perf_list=perf_list.filter((v)=>(v!=null));
                        break;
                    }
                }
                if(perf_board&&perf_list.length<=0){
                    perf_board.style.display='none';
                    perf_board_clear_button.style.display='none';
                }
                this.element=null;
            },
        }
        perf_board.append(div);
        perf_list.push(data);

        perf_board.style.display='block';
        perf_board_clear_button.style.display='flex';
        div.scrollIntoView({behavior:'smooth', block:'center'});
        return data;
    }
    return;
}

function getTimeDiff(startTime){
    const msDiff=(new Date().getTime()-startTime);
    const ms=Math.floor((msDiff/10)%1000).toString().padStart(3, '0');
    const s=Math.floor((msDiff/1000)%60).toString().padStart(2, '0');
    const m=Math.floor((msDiff/60000)%60).toString().padStart(2, '0');
    return `${msDiff<0?'-':''}${m}:${s}.${ms}`;
}

setInterval(() => {
    perf_list.forEach(u=>u.update());
}, 10);


window.addEventListener('load', ()=>{
    perf_board = document.getElementById('perf-board');
    perf_board_button = document.getElementById('perf-board-button');
    perf_board_button.addEventListener('click', ()=>{
        if(!perf_board.style.display||perf_board.style.display=='none'){
            perf_board.style.display='block';
            perf_board_clear_button.style.display='flex';
        }else{
            perf_board.style.display='none';
            perf_board_clear_button.style.display='none';
        }
    });
    perf_board_clear_button = document.getElementById('perf-board-clear-button');
    perf_board_clear_button.addEventListener('click', ()=>{
        perf_list.forEach(r=>r.remove());
    });
}, {once:true});