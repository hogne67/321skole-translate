type Forms = readonly [singular: string, plural: string];
type LocalizedForms = readonly [nb: Forms, en: Forms, pt: Forms];
type LocalizedText = readonly [nb: string, en: string, pt: string];
export type WordProblemsTheme = "objects" | "money" | "length" | "weight" | "volume";

export const WORD_PROBLEMS_NAMES = [
  "Mina", "Amir", "Sara", "Leo", "Nora", "Elias", "Aisha", "Oliver",
  "Sofia", "Noah", "Emma", "Adam", "Ingrid", "Omar", "Linnea", "Filip",
  "Selma", "Isak", "Fatima", "Lucas", "Ella", "Yusuf", "Frida", "Henrik",
] as const;

export const WORD_PROBLEMS_CONTAINERS = {
  bag: { nouns: [["pose", "poser"], ["bag", "bags"], ["saco", "sacos"]] },
  box: { nouns: [["eske", "esker"], ["box", "boxes"], ["caixa", "caixas"]], femininePt: true },
  basket: { nouns: [["kurv", "kurver"], ["basket", "baskets"], ["cesto", "cestos"]] },
  pencilCase: { nouns: [["pennal", "pennaler"], ["pencil case", "pencil cases"], ["estojo", "estojos"]] },
  packet: { nouns: [["pakke", "pakker"], ["packet", "packets"], ["pacote", "pacotes"]] },
  tray: { nouns: [["brett", "brett"], ["tray", "trays"], ["tabuleiro", "tabuleiros"]] },
  envelope: { nouns: [["konvolutt", "konvolutter"], ["envelope", "envelopes"], ["envelope", "envelopes"]] },
  jar: { nouns: [["glass", "glass"], ["jar", "jars"], ["frasco", "frascos"]] },
  purse: { nouns: [["pengepung", "pengepunger"], ["purse", "purses"], ["porta-moedas", "porta-moedas"]] },
  piggyBank: { nouns: [["sparegris", "sparegriser"], ["piggy bank", "piggy banks"], ["mealheiro", "mealheiros"]] },
  roll: { nouns: [["rull", "ruller"], ["roll", "rolls"], ["rolo", "rolos"]], on: true },
  spool: { nouns: [["spole", "spoler"], ["spool", "spools"], ["carretel", "carretéis"]], on: true },
  bottle: { nouns: [["flaske", "flasker"], ["bottle", "bottles"], ["garrafa", "garrafas"]], femininePt: true },
  tin: { nouns: [["boks", "bokser"], ["tin", "tins"], ["lata", "latas"]], femininePt: true },
} satisfies Record<string, { nouns: LocalizedForms; on?: boolean; femininePt?: boolean }>;

type Context = { theme: WordProblemsTheme; unit: string; nouns: LocalizedForms; container: keyof typeof WORD_PROBLEMS_CONTAINERS; femininePt?: boolean; intro?: LocalizedText };
const context = (theme: WordProblemsTheme, unit: string, nouns: LocalizedForms, container: Context["container"], extra: Pick<Context, "femininePt" | "intro"> = {}): Context => ({ theme, unit, nouns, container, ...extra });
const school: LocalizedText = ["{n} gjør klart skolesaker.", "{n} is organising school supplies.", "{n} está a organizar material escolar."];
const craft: LocalizedText = ["{n} gjør klart til en hobbydag.", "{n} is preparing for a craft day.", "{n} está a preparar um dia de trabalhos manuais."];
const trip: LocalizedText = ["{n} gjør klart til en tur.", "{n} is preparing for a trip.", "{n} está a preparar uma excursão."];
const money: LocalizedForms = [["kr", "kr"], ["kr", "kr"], ["kr", "kr"]];

// Existing keys keep their original wording and units so saved sheets reopen unchanged.
export const WORD_PROBLEMS_CONTEXTS = {
  books: context("objects", "books", [["bok", "bøker"], ["book", "books"], ["livro", "livros"]], "bag"),
  apples: context("objects", "apples", [["eple", "epler"], ["apple", "apples"], ["maçã", "maçãs"]], "bag", { femininePt: true }),
  marbles: context("objects", "marbles", [["klinkekule", "klinkekuler"], ["marble", "marbles"], ["berlinde", "berlindes"]], "bag"),
  money: context("money", "kr", money, "envelope", { femininePt: true }),
  metres: context("length", "m", [["meter bånd", "meter bånd"], ["metre of ribbon", "metres of ribbon"], ["metro de fita", "metros de fita"]], "roll"),
  centimetres: context("length", "cm", [["centimeter bånd", "centimeter bånd"], ["centimetre of ribbon", "centimetres of ribbon"], ["centímetro de fita", "centímetros de fita"]], "roll"),
  pencils: context("objects", "pencils", [["blyant", "blyanter"], ["pencil", "pencils"], ["lápis", "lápis"]], "pencilCase", { intro: school }),
  erasers: context("objects", "erasers", [["viskelær", "viskelær"], ["eraser", "erasers"], ["borracha", "borrachas"]], "box", { intro: school, femininePt: true }),
  stickers: context("objects", "stickers", [["klistremerke", "klistremerker"], ["sticker", "stickers"], ["autocolante", "autocolantes"]], "packet", { intro: craft }),
  balls: context("objects", "balls", [["ball", "baller"], ["ball", "balls"], ["bola", "bolas"]], "basket", { femininePt: true, intro: ["{n} ordner utstyr til en aktivitetsdag.", "{n} is organising equipment for an activity day.", "{n} está a organizar material para um dia de atividades."] }),
  toyCars: context("objects", "toyCars", [["lekebil", "lekebiler"], ["toy car", "toy cars"], ["carrinho", "carrinhos"]], "box"),
  beads: context("objects", "beads", [["perle", "perler"], ["bead", "beads"], ["conta", "contas"]], "jar", { intro: craft, femininePt: true }),
  cookies: context("objects", "cookies", [["kjeks", "kjeks"], ["biscuit", "biscuits"], ["bolacha", "bolachas"]], "tray", { intro: ["{n} hjelper til på en basar.", "{n} is helping at a school fair.", "{n} está a ajudar numa feira escolar."], femininePt: true }),
  oranges: context("objects", "oranges", [["appelsin", "appelsiner"], ["orange", "oranges"], ["laranja", "laranjas"]], "basket", { intro: trip, femininePt: true }),
  flowers: context("objects", "flowers", [["blomst", "blomster"], ["flower", "flowers"], ["flor", "flores"]], "basket", { femininePt: true }),
  moneyPurse: context("money", "kr", money, "purse", { femininePt: true, intro: trip }),
  moneyJar: context("money", "kr", money, "jar", { femininePt: true, intro: ["{n} samler inn penger til klasseturen.", "{n} is collecting money for the class trip.", "{n} está a angariar dinheiro para a excursão da turma."] }),
  moneyPiggyBank: context("money", "kr", money, "piggyBank", { femininePt: true, intro: ["{n} sparer penger til en sykkel.", "{n} is saving money for a bicycle.", "{n} está a poupar dinheiro para uma bicicleta."] }),
  rope: context("length", "m", [["meter tau", "meter tau"], ["metre of rope", "metres of rope"], ["metro de corda", "metros de corda"]], "spool", { intro: trip }),
  fabric: context("length", "m", [["meter stoff", "meter stoff"], ["metre of fabric", "metres of fabric"], ["metro de tecido", "metros de tecido"]], "roll", { intro: craft }),
  string: context("length", "cm", [["centimeter snor", "centimeter snor"], ["centimetre of string", "centimetres of string"], ["centímetro de cordel", "centímetros de cordel"]], "spool", { intro: craft }),
  wire: context("length", "cm", [["centimeter ståltråd", "centimeter ståltråd"], ["centimetre of wire", "centimetres of wire"], ["centímetro de arame", "centímetros de arame"]], "spool", { intro: craft }),
  cable: context("length", "m", [["meter ledning", "meter ledning"], ["metre of cable", "metres of cable"], ["metro de cabo", "metros de cabo"]], "roll"),
  rice: context("weight", "kg", [["kilogram ris", "kilogram ris"], ["kilogram of rice", "kilograms of rice"], ["quilograma de arroz", "quilogramas de arroz"]], "bag"),
  flour: context("weight", "kg", [["kilogram mel", "kilogram mel"], ["kilogram of flour", "kilograms of flour"], ["quilograma de farinha", "quilogramas de farinha"]], "packet"),
  seeds: context("weight", "g", [["gram frø", "gram frø"], ["gram of seeds", "grams of seeds"], ["grama de sementes", "gramas de sementes"]], "bag", { intro: ["{n} pakker frø til en skolehage.", "{n} is packing seeds for a school garden.", "{n} está a preparar sementes para uma horta escolar."] }),
  raisins: context("weight", "g", [["gram rosiner", "gram rosiner"], ["gram of raisins", "grams of raisins"], ["grama de passas", "gramas de passas"]], "box", { intro: trip }),
  juice: context("volume", "l", [["liter saft", "liter saft"], ["litre of juice", "litres of juice"], ["litro de sumo", "litros de sumo"]], "bottle", { intro: trip }),
  milk: context("volume", "l", [["liter melk", "liter melk"], ["litre of milk", "litres of milk"], ["litro de leite", "litros de leite"]], "bottle"),
  paint: context("volume", "dl", [["desiliter maling", "desiliter maling"], ["decilitre of paint", "decilitres of paint"], ["decilitro de tinta", "decilitros de tinta"]], "tin", { intro: craft }),
  water: context("volume", "dl", [["desiliter vann", "desiliter vann"], ["decilitre of water", "decilitres of water"], ["decilitro de água", "decilitros de água"]], "bottle", { intro: trip }),
};
export type WordProblemsContext = keyof typeof WORD_PROBLEMS_CONTEXTS;
export const wordProblemsContextsForTheme = (theme: WordProblemsTheme): WordProblemsContext[] => (Object.keys(WORD_PROBLEMS_CONTEXTS) as WordProblemsContext[]).filter(key => WORD_PROBLEMS_CONTEXTS[key].theme === theme);

export const WORD_PROBLEMS_MEASUREMENT_UNITS: Record<string, LocalizedText> = {
  kr: ["kroner (kr)", "kroner (kr)", "coroas (kr)"], m: ["meter (m)", "metres (m)", "metros (m)"], cm: ["centimeter (cm)", "centimetres (cm)", "centímetros (cm)"],
  kg: ["kilogram (kg)", "kilograms (kg)", "quilogramas (kg)"], g: ["gram (g)", "grams (g)", "gramas (g)"], l: ["liter (l)", "litres (l)", "litros (l)"], dl: ["desiliter (dl)", "decilitres (dl)", "decilitros (dl)"],
};
