import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import MathGeneratorOverview from "@/components/generators/math/MathGeneratorOverview";
import MathText, { MathTextSupportProvider, sameMathLanguage } from "@/components/generators/math/MathTextSupport";
import TeacherFeedbackBox from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/TeacherFeedbackBox";
import { normalizeAudioLanguage } from "@/lib/audio/language";
import { LANGUAGES } from "@/lib/languages";

test("math overview links to all eight generators in every locale", () => {
  for (const locale of ["nb", "en", "pt"]) {
    const $ = load(renderToStaticMarkup(<MathGeneratorOverview locale={locale} />));
    assert.equal($("h1").length, 1);
    assert.equal($("a").length, 8);
    for (const path of ["arithmetic", "geometry?new=1", "fractions", "fraction-calculation", "measurement", "comparison", "percentage", "equations"]) assert.equal($(`a[href='/${locale}/producer/math/${path}']`).length, 1);
  }
});
test("anonymous overview preserves login destinations", () => {
  const $ = load(renderToStaticMarkup(<MathGeneratorOverview locale="nb" isGuest />));
  $("a").each((_, element) => {
    const href = $(element).attr("href")!;
    assert.match(href, /^\/nb\/login\?next=/);
    assert.match(decodeURIComponent(href), /\/nb\/producer\/math\//);
  });
});
test("math text outside student support stays unchanged in teacher and print views", () => {
  assert.equal(renderToStaticMarkup(<MathText text="Regn ut oppgavene." />), "Regn ut oppgavene.");
});

test("spoken equations can hide duplicate original text while preserving accessible controls", () => {
  assert.equal(renderToStaticMarkup(<MathText text="Løs ligningen." hideOriginal />), "");
  const $ = load(renderToStaticMarkup(<MathTextSupportProvider sourceLang="nb" targetLang="en" audioBusy={false} translateText={async text => text} onPlay={() => {}} t={key => key}><MathText text="Løs ligningen." hideOriginal /></MathTextSupportProvider>));
  assert.equal($(".sr-only").text(), "Løs ligningen.");
  assert.equal($("button[aria-label='tts.playAudio']").length, 1);
  assert.equal($("button[aria-label='translate.text']").length, 1);
});
test("math text offers named keyboard buttons without another language selector", () => {
  const $ = load(renderToStaticMarkup(<MathTextSupportProvider sourceLang="nb" targetLang="en" audioBusy={false} translateText={async text => text} onPlay={() => {}} t={key => key}><MathText text="Forkort svaret." /></MathTextSupportProvider>));
  assert.equal($("button[aria-label='tts.playAudio']").length, 1);
  assert.equal($("button[aria-label='translate.text']").length, 1);
  assert.equal($("select").length, 0);
  assert.ok($("button").toArray().every(element => $(element).attr("title") && $(element).attr("type") === "button"));
});
test("source-language aliases hide redundant translation and busy audio disables playback", () => {
  assert.equal(sameMathLanguage("nb", "no"), true);
  assert.equal(sameMathLanguage("nb", "nn"), false);
  const $ = load(renderToStaticMarkup(<MathTextSupportProvider sourceLang="nb" targetLang="no" audioBusy translateText={async text => text} onPlay={() => {}} t={key => key}><MathText text="Forkort svaret." /></MathTextSupportProvider>));
  assert.equal($("button").length, 1);
  assert.equal($("button[disabled]").length, 1);
});
test("teacher feedback reuses the page language without its own selector", () => {
  const $ = load(renderToStaticMarkup(<TeacherFeedbackBox text="Prøv igjen." updatedAt={null} translatedText="Try again." targetLang="en" translating={false} ttsBusy={null} t={key => key} onTranslate={() => {}} onPlayOriginal={() => {}} onPlayTranslation={() => {}} />));
  assert.equal($("select, [role='combobox']").length, 0);
  assert.equal($("[lang='en'][dir='auto']").length, 1);
});
test("audio preserves all offered language codes instead of treating translations as Norwegian", () => {
  for (const item of LANGUAGES) assert.equal(normalizeAudioLanguage(item.code), item.code === "nb" ? "no" : item.code);
  assert.equal(normalizeAudioLanguage("pt_br"), "pt-BR");
  assert.equal(normalizeAudioLanguage("pt"), "pt-BR");
  assert.equal(normalizeAudioLanguage("not-a-language"), "no");
});
