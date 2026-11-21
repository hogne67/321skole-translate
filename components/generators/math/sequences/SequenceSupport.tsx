import { formatSequencesValue, getSequencesCopy, sequencesValues, type SequencesTask } from "@/lib/math/sequences/worksheet";

export function PatternFigures({task,language}:{task:SequencesTask;language:string}) {
  const copy=getSequencesCopy(language),values=sequencesValues(task);
  return <div className="sequences-figures">{[0,1,2].map(stage=>{
    const cells:{x:number;y:number}[]=[];
    if(task.figure==="squares")for(let y=0;y<=stage;y++)for(let x=0;x<=stage;x++)cells.push({x,y});
    else if(task.figure==="triangles")for(let y=0;y<=stage;y++)for(let x=0;x<=y;x++)cells.push({x,y});
    else {const count=values[stage].n,cols=task.figure==="rows"?stage+1:Math.min(count,4);for(let i=0;i<count;i++)cells.push({x:i%cols,y:Math.floor(i/cols)});}
    return <figure key={stage}><figcaption>{copy.figure} {stage+1}</figcaption><svg viewBox="0 0 100 60" role="img" aria-label={`${copy.figure} ${stage+1}. ${copy.count}: ${values[stage].n}`}>
      {cells.map(({x,y},i)=><rect key={i} x={10+x*15} y={5+y*15} width={15} height={15} fill="#d1fae5" stroke="#334155" strokeWidth={1}/>)}
    </svg></figure>;
  })}</div>;
}
export default function SequenceSupport({task,language}:{task:SequencesTask;language:string}) {
  const copy=getSequencesCopy(language),values=sequencesValues(task);
  const labels=values.map((v,i)=>task.hidden.includes(i)?"?":formatSequencesValue(v,task.notation,language));
  if(task.rule.kind==="add"&&task.rule.a.n<0)labels.reverse();
  if(task.rule.kind==="add")return <figure className="sequences-line" aria-label={`${copy.support}: ${labels.join(", ")}`}>
    <svg viewBox="0 0 600 100" aria-hidden="true"><path d="M25 38H575M25 38L35 31M25 38L35 45M575 38L565 31M575 38L565 45" fill="none" stroke="currentColor" strokeWidth={2}/>
      {labels.map((label,i)=><g key={i}><path d={`M${50+i*100} 29v18`} stroke="currentColor" strokeWidth={2}/><text x={50+i*100} y={77} textAnchor="middle">{label}</text></g>)}
    </svg>
  </figure>;
  return <table className="sequences-table"><tbody><tr><th>{copy.position}</th>{labels.map((_,i)=><td key={i}>{i+1}</td>)}</tr><tr><th>{copy.term}</th>{labels.map((label,i)=><td key={i}>{label}</td>)}</tr></tbody></table>;
}
