export type InviteEmailDetails = {
  locale: string; email: string; displayName: string; schoolName: string;
  adminName: string; inviteUrl: string; inviteCode: string; expiresAt: number;
};

export function inviteEmailCopy(data: InviteEmailDetails) {
  const locale = data.locale === "en" || data.locale === "pt" ? data.locale : "nb";
  const date = new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "long", timeZone: "Europe/Oslo" }).format(data.expiresAt);
  const copy = {
    nb: {
      title: `Velkommen til ${data.schoolName} på 321school`,
      hello: data.displayName ? `Hei ${data.displayName}!` : "Hei!",
      intro: "Så hyggelig å få deg med! Du er invitert til å bruke 321school som lærer ved skolen vår.",
      instructions: `Åpne invitasjonslenken og logg inn, eller opprett en konto med ${data.email}. Når du godtar invitasjonen, kobles kontoen din til skolen.`,
      attachment: "Vedlagt finner du invitasjonen som PDF med lenke og QR-kode. Du kan åpne den på skjermen eller skrive den ut.",
      action: "Åpne invitasjonen", qr: "Skann QR-koden for å åpne invitasjonen", code: "Invitasjonskode",
      manual: "Du kan også åpne adressen nedenfor og skrive inn invitasjonskoden:",
      expires: `Invitasjonen er gyldig til ${date}.`, closing: "Vi gleder oss til å komme i gang sammen!", regards: "Vennlig hilsen",
    },
    en: {
      title: `Welcome to ${data.schoolName} on 321school`, hello: data.displayName ? `Hello ${data.displayName}!` : "Hello!",
      intro: "We are happy to welcome you! You are invited to use 321school as a teacher at our school.",
      instructions: `Open the invitation link and sign in, or create an account using ${data.email}. Accept the invitation to connect your account to the school.`,
      attachment: "Your invitation is attached as a PDF with a link and QR code. You can open it on screen or print it.",
      action: "Open invitation", qr: "Scan the QR code to open the invitation", code: "Invitation code",
      manual: "You can also open the address below and enter your invitation code:",
      expires: `The invitation is valid until ${date}.`, closing: "We look forward to getting started together!", regards: "Kind regards",
    },
    pt: {
      title: `Bem-vindo a ${data.schoolName} no 321school`, hello: data.displayName ? `Olá ${data.displayName}!` : "Olá!",
      intro: "É um prazer receber você! Convidamos você a usar o 321school como professor na nossa escola.",
      instructions: `Abra o convite e entre ou crie uma conta com ${data.email}. Aceite o convite para vincular sua conta à escola.`,
      attachment: "O convite está anexado em PDF com link e código QR. Você pode abrir o documento na tela ou imprimi-lo.",
      action: "Abrir convite", qr: "Leia o código QR para abrir o convite", code: "Código do convite",
      manual: "Você também pode abrir o endereço abaixo e inserir o código do convite:",
      expires: `O convite é válido até ${date}.`, closing: "Estamos ansiosos para começar juntos!", regards: "Atenciosamente",
    },
  }[locale];
  return copy;
}

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function buildInviteEmail(data: InviteEmailDetails) {
  const copy = inviteEmailCopy(data);
  const paragraphs = [copy.hello, copy.intro, copy.instructions, copy.attachment, copy.expires, copy.closing];
  const signature = [copy.regards, data.adminName, data.schoolName].filter(Boolean);
  return {
    subject: copy.title,
    text: [...paragraphs, `${copy.action}: ${data.inviteUrl}`, ...(data.inviteCode ? [`${copy.code}: ${data.inviteCode}`] : []), ...signature].join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px"><h2>${escapeHtml(copy.title)}</h2>${paragraphs.slice(0, 4).map(p => `<p>${escapeHtml(p)}</p>`).join("")}<p><a href="${escapeHtml(data.inviteUrl)}" style="display:inline-block;padding:12px 18px;background:#2457d6;color:white;text-decoration:none;border-radius:8px">${escapeHtml(copy.action)}</a></p><p style="word-break:break-all">${escapeHtml(data.inviteUrl)}</p>${data.inviteCode ? `<p>${escapeHtml(copy.code)}: <strong>${escapeHtml(data.inviteCode)}</strong></p>` : ""}<p>${escapeHtml(copy.expires)}</p><p>${escapeHtml(copy.closing)}</p><p>${signature.map(escapeHtml).join("<br>")}</p></div>`,
  };
}
