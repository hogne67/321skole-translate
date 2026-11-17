import { orderedPrintTasks, printTrueFalseAnswer, type ReadingTestPrintContent, type ReadingTestPrintLayout } from "@/lib/readingTests/print";
import { getReadingTestPrintCopy } from "@/lib/readingTests/printCopy";
import { getListeningCopy, listeningText } from "@/lib/listeningTests/copy";
import { getListeningStartCopy } from "@/lib/listeningTests/startCopy";

export default function ReadingTestWorksheet({ content, locale, mode, layout = "after_text" }: {
  content: ReadingTestPrintContent;
  locale: string;
  mode: "learner" | "key";
  layout?: Exclude<ReadingTestPrintLayout, "auto">;
}) {
  const copy = getReadingTestPrintCopy(locale);
  const tasks = orderedPrintTasks(content.tasks);
  const isKey = mode === "key";
  const listening = content.modality === "listening";
  const grammar = content.modality === "grammar";
  const listenCopy = getListeningCopy(locale);
  const startCopy=getListeningStartCopy(locale);
  return (
    <article className={`reading-test-print-sheet${listening ? " listening-test-print-sheet" : ""}${grammar ? " grammar-test-print-sheet" : ""}`} data-sheet={mode}>
      <header className="reading-test-sheet-header">
        <p className="reading-test-sheet-brand">{copy.brand}</p>
        <p className="reading-test-sheet-kind">{grammar ? "Setninger og grammatikk · " : listening ? `${listenCopy.studentTitle} · ` : ""}{isKey ? listening ? listenCopy.teacherPrint : copy.key : copy.learner} · {copy.level}: {content.level==="A1Start"?startCopy.label:content.level} · {copy.tasks}: {tasks.length}</p>
        <h2 dir="auto">{content.title}</h2>
        {isKey ? <p className="reading-test-sheet-note">{listening ? content.listeningClips?startCopy.printNote:listenCopy.printNote : copy.teacherNote}</p> : (
          <div className="reading-test-sheet-identity"><span>{copy.name}: <span className="reading-test-sheet-line" /></span><span>{copy.date}: <span className="reading-test-sheet-line reading-test-sheet-line-short" /></span></div>
        )}
      </header>

      {!grammar && (!listening && !isKey || listening && isKey) && (
        <section className="reading-test-sheet-source" aria-label={listening ? listenCopy.scriptPrint : copy.reading}>
          <h3>{listening ? listenCopy.scriptPrint : copy.reading}</h3>
          <div lang={content.language} dir="auto">
            {content.listeningClips?content.listeningClips.map((clip,index)=><div key={clip.taskId}><h4>{listeningText(startCopy.clip,{number:index+1})}</h4><p>{tasks.find(task=>task.id===clip.taskId)?.prompt}</p><p>{clip.script}</p></div>):content.sourceText.trim().split(/\n\s*\n/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </section>
      )}

      <section className={`reading-test-sheet-questions${!listening && !isKey && layout === "new_page" ? " reading-test-questions-new-page" : ""}`} aria-label={copy.tasks}>
        <h3>{copy.tasks}</h3>
        {!isKey && <p className="reading-test-sheet-instructions">{grammar ? "Velg riktig ord eller form i hver setning. Sett ett kryss per oppgave." : listening ? `${content.listeningClips?startCopy.printInstructions:listenCopy.printInstructions} ${listeningText(content.listeningClips?startCopy.teacherPolicy:listenCopy.teacherPolicy, {count: content.plays ?? 2})}` : copy.instructions}</p>}
        <table className="reading-test-sheet-task-list" role="presentation"><tbody>
          {tasks.map((task, index) => {
            const trueFalseAnswer = task.type === "true_false" ? printTrueFalseAnswer(task.correctAnswer) : null;
            const answerIndex = task.options?.findIndex(option => option === task.correctAnswer) ?? -1;
            const answer = task.type === "true_false"
              ? trueFalseAnswer === null ? null : trueFalseAnswer ? copy.trueLabel : copy.falseLabel
              : answerIndex >= 0 ? `${String.fromCharCode(65 + answerIndex)}. ${task.options![answerIndex]}` : null;
            const options = task.type === "true_false" ? [copy.trueLabel, copy.falseLabel] : task.options ?? [];
            return (
              <tr key={task.id} className="reading-test-sheet-task"><td>
                <p className="reading-test-sheet-prompt" lang={content.language}>{index + 1}. {task.prompt}</p>
                {isKey ? (
                  <div><p className="reading-test-sheet-answer">{copy.answer}: <strong dir="auto">{answer ?? copy.missingAnswer}</strong></p>{grammar && task.explanation && <p>{task.explanation}</p>}</div>
                ) : (
                  <ul className="reading-test-sheet-options">
                    {options.map((option, optionIndex) => <li key={optionIndex}><span className="reading-test-sheet-box" aria-hidden="true" /><span>{String.fromCharCode(65 + optionIndex)}.</span><span dir="auto" lang={task.type === "true_false" ? locale : content.language}>{option}</span></li>)}
                  </ul>
                )}
              </td></tr>
            );
          })}
        </tbody></table>
      </section>
    </article>
  );
}
