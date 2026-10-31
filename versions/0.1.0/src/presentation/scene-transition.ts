export class SceneTransition {
 readonly element=document.createElement('div'); busy=false;
 constructor(){this.element.className='scene-transition';this.element.hidden=true;document.body.append(this.element);}
 async run(change:()=>void|Promise<void>):Promise<void>{if(this.busy)return;this.busy=true;this.element.hidden=false;try{await this.element.animate([{opacity:0},{opacity:1}],{duration:400,fill:'forwards',easing:'ease-in-out'}).finished;await change();await this.element.animate([{opacity:1},{opacity:0}],{duration:400,fill:'forwards',easing:'ease-in-out'}).finished;}finally{this.element.hidden=true;this.busy=false;}}
 dispose():void{this.element.getAnimations().forEach(a=>a.cancel());this.element.remove();}
}
