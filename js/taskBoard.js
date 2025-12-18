let task_board;
let task_board_button;

let task_list=[];

function newTask(name='APPLE', detail="", process=0){
    if(task_board){
        const div=document.createElement('div');
        div.style.cssText='width:250px;border: 1px solid black;margin-bottom:3px;box-sizing: border-box;display: flex;flex-direction: column;justify-content: space-between;';
        const element_name=document.createElement('span');
        element_name.style.cssText='font-size:1.2em;';
        element_name.innerHTML=name;
        div.append(element_name);
        const element_detail=document.createElement('span');
        element_detail.innerHTML=detail;
        div.append(element_detail);
        const progress_bar=document.createElement('progress');
        progress_bar.style.cssText='width:100%';
        if(process!=null) progress_bar.value=process;
        div.append(progress_bar);

        let data={
            uuid: uuid(),
            name: name,
            detail: detail,
            process: 0,
            element:{
                div: div,
                name:element_name,
                detail:element_detail,
                bar: progress_bar,
            },
            update:function(name, detail, process){
                if(name!=null) this.name=name;
                if(detail!=null) this.detail=detail;
                if(process!=null) this.process=process;
                this.element.name.innerHTML=this.name;
                this.element.detail.innerHTML=this.detail;
                this.element.bar.value=this.process;
            },
            remove:function(){
                if(this.element)
                    task_board.removeChild(this.element.div)
                for(let i=0;i<task_list.length;i++){
                    if(task_list[i].uuid==this.uuid){
                        task_list[i]=null;
                        task_list=task_list.filter((v)=>(v!=null));
                        break;
                    }
                }
                if(task_board&&task_list.length<=0)
                    task_board.style.display='none';
                this.element=null;
            },
        }
        task_board.append(div);
        task_list.push(data);

        task_board.style.display='block';
        return data;
    }
    return;
}


window.addEventListener('load', ()=>{
    task_board = document.getElementById('task-board');
    task_board_button = document.getElementById('task-board-button');
    task_board_button.addEventListener('click', ()=>{
        if(!task_board.style.display||task_board.style.display=='none')
            task_board.style.display='block';
        else
            task_board.style.display='none';
    });
}, {once:true});