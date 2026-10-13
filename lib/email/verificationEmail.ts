export function buildVerificationEmail(input: { locale: string; displayName: string; verifyUrl: string }) {
  const copy = input.locale === "en" ? {
    brand: "321school", title: "Verify your email", greeting: "Hi", fallback: "there",
    intro: "Welcome to 321school! We are glad you are here.",
    instruction: "Please confirm that this email address belongs to you by clicking the button below.",
    next: "Once you have confirmed, return to 321school and select ‘I have verified. Check again’ if the notice is still showing.",
    linkHelp: "If the button does not work, copy this link into your browser:",
    ignore: "If you did not request this email, you can safely ignore it.", signoff: "Kind regards",
  } : input.locale === "pt" ? {
    brand: "321escola", title: "Confirme seu e-mail", greeting: "Olá", fallback: "",
    intro: "Boas-vindas à 321escola! É um prazer ter você aqui.",
    instruction: "Confirme que este endereço de e-mail pertence a você clicando no botão abaixo.",
    next: "Após confirmar, volte à 321escola e selecione ‘Já confirmei. Verificar novamente’ se o aviso ainda aparecer.",
    linkHelp: "Se o botão não funcionar, copie este link no navegador:",
    ignore: "Se você não solicitou este e-mail, pode ignorá-lo com segurança.", signoff: "Atenciosamente",
  } : {
    brand: "321skole", title: "Bekreft e-posten din", greeting: "Hei", fallback: "",
    intro: "Velkommen til 321skole! Hyggelig å ha deg med.",
    instruction: "Bekreft at denne e-postadressen er din ved å trykke på knappen under.",
    next: "Når du har bekreftet, kan du gå tilbake til 321skole og velge «Jeg har bekreftet. Sjekk på nytt» hvis beskjeden fortsatt vises.",
    linkHelp: "Hvis knappen ikke virker, kan du kopiere denne lenken til nettleseren:",
    ignore: "Hvis du ikke har bedt om denne e-posten, kan du trygt se bort fra den.", signoff: "Vennlig hilsen",
  };
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const name = input.displayName.trim() || copy.fallback;
  const greeting = `${copy.greeting}${name ? ` ${name}` : ""}!`;
  const url = escape(input.verifyUrl);
  return {
    subject: `${copy.title} – ${copy.brand}`,
    text: [greeting, copy.intro, copy.instruction, `${copy.title}: ${input.verifyUrl}`, copy.next,
      copy.ignore, `${copy.signoff}\n${copy.brand}`].join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto;padding:24px">
      <p style="color:#0369a1;font-weight:800;font-size:20px">${copy.brand}</p>
      <h1 style="font-size:24px;line-height:1.3">${copy.title}</h1>
      <p>${escape(greeting)}</p><p>${copy.intro}</p><p>${copy.instruction}</p>
      <p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#169125;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">${copy.title}</a></p>
      <p>${copy.next}</p><p style="font-size:13px;color:#475569">${copy.linkHelp}</p>
      <p style="word-break:break-all;font-size:13px"><a href="${url}">${url}</a></p>
      <p style="font-size:13px;color:#475569">${copy.ignore}</p><p>${copy.signoff}<br>${copy.brand}</p>
    </div>`,
  };
}
