export function passwordResetCopy(locale: string) {
  return locale === "en" ? {
    brand: "321school", title: "Reset your password", action: "Create a new password", hello: "Hi!",
    intro: "We received a request to reset the password for your 321school account.",
    instruction: "Click the button below to choose a new password. Then sign in to 321school with your new password.",
    ignore: "If you did not request this, you can ignore this email. Your password will stay the same.",
    linkHelp: "If the button does not work, copy this link into your browser:", regards: "Kind regards",
    requestReceived: "Your request has been received. If this email address has an account, you will receive a link to create a new password.",
    failed: "We could not process your request right now. Please try again shortly.",
    emailLabel: "Email", emailPlaceholder: "name@example.com", back: "Back to sign in", sending: "Sending…",
    formIntro: "Enter your email address to request a link to create a new password.", sendLink: "Send reset link",
  } : locale === "pt" ? {
    brand: "321escola", title: "Redefina sua senha", action: "Criar uma nova senha", hello: "Olá!",
    intro: "Recebemos uma solicitação para redefinir a senha da sua conta na 321escola.",
    instruction: "Clique no botão abaixo para escolher uma nova senha. Depois, entre na 321escola com sua nova senha.",
    ignore: "Se você não solicitou isso, pode ignorar este e-mail. Sua senha continuará a mesma.",
    linkHelp: "Se o botão não funcionar, copie este link no navegador:", regards: "Atenciosamente",
    requestReceived: "Recebemos sua solicitação. Se houver uma conta com este endereço de e-mail, você receberá um link para criar uma nova senha.",
    failed: "Não foi possível processar sua solicitação agora. Tente novamente em instantes.",
    emailLabel: "E-mail", emailPlaceholder: "nome@exemplo.com", back: "Voltar ao login", sending: "Enviando…",
    formIntro: "Informe seu e-mail para solicitar um link para criar uma nova senha.", sendLink: "Enviar link",
  } : {
    brand: "321skole", title: "Tilbakestill passordet ditt", action: "Lag nytt passord", hello: "Hei!",
    intro: "Vi har fått en forespørsel om å tilbakestille passordet til kontoen din hos 321skole.",
    instruction: "Trykk på knappen under for å velge et nytt passord. Etterpå kan du logge inn på 321skole med det nye passordet.",
    ignore: "Hvis du ikke har bedt om dette, kan du se bort fra e-posten. Passordet ditt blir da ikke endret.",
    linkHelp: "Hvis knappen ikke virker, kan du kopiere denne lenken til nettleseren:", regards: "Vennlig hilsen",
    requestReceived: "Forespørselen er mottatt. Hvis du har en konto med denne e-postadressen, får du en lenke for å lage nytt passord.",
    failed: "Vi kunne ikke behandle forespørselen akkurat nå. Prøv igjen om litt.",
    emailLabel: "E-post", emailPlaceholder: "navn@epost.no", back: "Tilbake til innlogging", sending: "Sender…",
    formIntro: "Skriv inn e-postadressen din, så sender vi deg en lenke for å lage nytt passord.", sendLink: "Send lenke",
  };
}

export function buildPasswordResetEmail(input: { locale: string; resetUrl: string }) {
  const copy = passwordResetCopy(input.locale);
  const url = input.resetUrl.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  return {
    subject: `${copy.title} – ${copy.brand}`,
    text: [copy.hello, copy.intro, copy.instruction, `${copy.action}: ${input.resetUrl}`, copy.ignore,
      `${copy.regards}\n${copy.brand}`].join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:auto;padding:24px">
      <p style="color:#0369a1;font-weight:800;font-size:20px">${copy.brand}</p><h1 style="font-size:24px;line-height:1.3">${copy.title}</h1>
      <p>${copy.hello}</p><p>${copy.intro}</p><p>${copy.instruction}</p>
      <p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#169125;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">${copy.action}</a></p>
      <p>${copy.ignore}</p><p style="font-size:13px;color:#475569">${copy.linkHelp}</p>
      <p style="word-break:break-all;font-size:13px"><a href="${url}">${url}</a></p><p>${copy.regards}<br>${copy.brand}</p></div>`,
  };
}
