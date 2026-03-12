import sqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

const db = new sqlite3('herbs.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS herbs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    primary_uses TEXT,
    contraindications TEXT,
    effects_actions TEXT,
    storage TEXT,
    application_methods TEXT,
    pairs_well_with TEXT
  )
`);

// Function to sync from Excel
function syncFromExcel() {
  const excelPath = path.join(process.cwd(), 'herbal_database.xlsx');
  
  if (fs.existsSync(excelPath)) {
    console.log('Found herbal_database.xlsx, syncing data...');
    try {
      const workbook = XLSX.readFile(excelPath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const upsert = db.prepare(`
        INSERT INTO herbs (name, category, primary_uses, contraindications, effects_actions, storage, application_methods, pairs_well_with)
        VALUES (@name, @category, @primary_uses, @contraindications, @effects_actions, @storage, @application_methods, @pairs_well_with)
        ON CONFLICT(name) DO UPDATE SET
          category=excluded.category,
          primary_uses=excluded.primary_uses,
          contraindications=excluded.contraindications,
          effects_actions=excluded.effects_actions,
          storage=excluded.storage,
          application_methods=excluded.application_methods,
          pairs_well_with=excluded.pairs_well_with
      `);

      const syncTransaction = db.transaction((rows) => {
        for (const row of rows as any[]) {
          upsert.run({
            name: row['Herb Name'] || row['name'],
            category: row['Category'] || row['category'],
            primary_uses: row['Primary Uses'] || row['primary_uses'],
            contraindications: row['Contraindications'] || row['contraindications'],
            effects_actions: row['Effects / Actions'] || row['effects_actions'],
            storage: row['Storage'] || row['storage'],
            application_methods: row['Application Methods'] || row['application_methods'],
            pairs_well_with: row['Pairs Well With'] || row['pairs_well_with']
          });
        }
      });

      syncTransaction(data);
      console.log(`Successfully synced ${data.length} herbs from Excel.`);
    } catch (error) {
      console.error('Error syncing from Excel:', error);
    }
  }
}

// Initial seed if empty
const seedData = [
  {
    name: "Lavender",
    category: "Floral",
    primary_uses: "Anxiety, sleep, headaches, skin irritation",
    contraindications: "Pregnancy (high doses), allergies to Lamiaceae",
    effects_actions: "Calming, antibacterial, anti-inflammatory",
    storage: "Cool dark place, airtight jar",
    application_methods: "Tea, essential oil, topical, sachet",
    pairs_well_with: "Chamomile, lemon balm, rosemary"
  },
  {
    name: "Chamomile",
    category: "Floral",
    primary_uses: "Insomnia, digestive upset, anxiety, skin inflammation",
    contraindications: "Ragweed allergy, blood thinners, pregnancy",
    effects_actions: "Sedative, anti-spasmodic, anti-inflammatory",
    storage: "Airtight container away from light",
    application_methods: "Tea, tincture, topical compress",
    pairs_well_with: "Lavender, lemon balm, passionflower"
  },
  {
    name: "Peppermint",
    category: "Mint",
    primary_uses: "IBS, nausea, headaches, congestion",
    contraindications: "GERD, hiatal hernia, infants under 2, gallstones",
    effects_actions: "Cooling, analgesic, antispasmodic, decongestant",
    storage: "Sealed container, away from heat",
    application_methods: "Tea, essential oil, capsule, topical",
    pairs_well_with: "Spearmint, ginger, fennel"
  },
  {
    name: "Echinacea",
    category: "Herbaceous",
    primary_uses: "Immune support, cold prevention, wound healing",
    contraindications: "Autoimmune disorders, HIV, tuberculosis",
    effects_actions: "Immunostimulant, anti-inflammatory, antiviral",
    storage: "Cool dry place, tincture refrigerated",
    application_methods: "Tincture, capsule, tea",
    pairs_well_with: "Elderberry, astragalus, ginger"
  },
  {
    name: "Ginger",
    category: "Root",
    primary_uses: "Nausea, digestion, inflammation, motion sickness",
    contraindications: "High doses in pregnancy, blood thinners, gallstones",
    effects_actions: "Anti-nausea, warming, anti-inflammatory, carminative",
    storage: "Fresh: refrigerate; dried: cool dry place",
    application_methods: "Tea, capsule, fresh, tincture, cooking",
    pairs_well_with: "Turmeric, lemon, chamomile, peppermint"
  },
  {
    name: "Turmeric",
    category: "Root",
    primary_uses: "Inflammation, joint pain, digestive issues, liver support",
    contraindications: "Blood thinners, gallbladder disease, pregnancy (high doses)",
    effects_actions: "Anti-inflammatory, antioxidant, hepatoprotective",
    storage: "Cool dark dry storage, away from moisture",
    application_methods: "Capsule, cooking, golden milk, tincture",
    pairs_well_with: "Ginger, black pepper, ashwagandha"
  },
  {
    name: "Valerian",
    category: "Root",
    primary_uses: "Insomnia, anxiety, restlessness, muscle tension",
    contraindications: "Pregnancy, liver disease, CNS depressants, children",
    effects_actions: "Sedative, anxiolytic, muscle relaxant",
    storage: "Tightly sealed, cool dark place",
    application_methods: "Tea, tincture, capsule",
    pairs_well_with: "Passionflower, hops, lemon balm"
  },
  {
    name: "St. John's Wort",
    category: "Flowering",
    primary_uses: "Mild-moderate depression, nerve pain, wound healing",
    contraindications: "SSRIs, MAOIs, birth control, anticoagulants, photosensitivity",
    effects_actions: "Antidepressant, anti-inflammatory, antiviral",
    storage: "Airtight, away from light and heat",
    application_methods: "Tincture, capsule, tea, topical oil",
    pairs_well_with: "Lemon balm, oat straw"
  },
  {
    name: "Elderberry",
    category: "Berry",
    primary_uses: "Cold/flu prevention, immune support, inflammation",
    contraindications: "Autoimmune conditions, uncooked berries toxic",
    effects_actions: "Antiviral, immunostimulant, antioxidant",
    storage: "Syrup refrigerated, dried in cool dry place",
    application_methods: "Syrup, tincture, tea, gummies",
    pairs_well_with: "Echinacea, ginger, rosehip"
  },
  {
    name: "Ashwagandha",
    category: "Root",
    primary_uses: "Stress, fatigue, hormonal balance, cognition",
    contraindications: "Pregnancy, thyroid disorders, autoimmune disease, nightshade sensitivity",
    effects_actions: "Adaptogen, anti-stress, immunomodulatory",
    storage: "Dry airtight container",
    application_methods: "Capsule, powder in milk/smoothie",
    pairs_well_with: "Turmeric, shatavari, brahmi"
  },
  {
    name: "Lemon Balm",
    category: "Mint",
    primary_uses: "Anxiety, insomnia, cold sores, digestion",
    contraindications: "Thyroid disorders, sedative medications",
    effects_actions: "Antiviral, calming, carminative",
    storage: "Airtight container, cool dry place",
    application_methods: "Tea, tincture, topical, capsule",
    pairs_well_with: "Chamomile, lavender, valerian"
  },
  {
    name: "Rosemary",
    category: "Evergreen",
    primary_uses: "Memory, hair growth, digestion, circulation",
    contraindications: "Pregnancy (high doses), epilepsy, high blood pressure",
    effects_actions: "Antioxidant, circulatory stimulant, antimicrobial",
    storage: "Dried: airtight; Fresh: refrigerate",
    application_methods: "Tea, essential oil, cooking, hair rinse",
    pairs_well_with: "Lavender, peppermint, thyme"
  },
  {
    name: "Holy Basil (Tulsi)",
    category: "Herbaceous",
    primary_uses: "Stress, respiratory health, immunity",
    contraindications: "Pregnancy, trying to conceive, blood thinners",
    effects_actions: "Adaptogen, antibacterial, antioxidant",
    storage: "Cool dry place, away from light",
    application_methods: "Tea, tincture, fresh leaves",
    pairs_well_with: "Ginger, honey, lemon"
  },
  {
    name: "Milk Thistle",
    category: "Flowering",
    primary_uses: "Liver detox, hangover recovery, cholesterol",
    contraindications: "Ragweed allergy, estrogen-sensitive conditions",
    effects_actions: "Hepatoprotective, antioxidant, anti-inflammatory",
    storage: "Airtight container, cool place",
    application_methods: "Capsule, tincture, tea (seeds)",
    pairs_well_with: "Dandelion root, turmeric"
  },
  {
    name: "Dandelion Root",
    category: "Root",
    primary_uses: "Liver support, digestion, water retention",
    contraindications: "Gallbladder obstruction, kidney issues",
    effects_actions: "Diuretic, cholagogue, digestive bitter",
    storage: "Dried root in airtight jar",
    application_methods: "Tea (decoction), tincture, capsule",
    pairs_well_with: "Burdock root, milk thistle"
  }
];

const insert = db.prepare(`
  INSERT INTO herbs (name, category, primary_uses, contraindications, effects_actions, storage, application_methods, pairs_well_with)
  VALUES (@name, @category, @primary_uses, @contraindications, @effects_actions, @storage, @application_methods, @pairs_well_with)
`);

const count = db.prepare('SELECT COUNT(*) as count FROM herbs').get();
if (count.count === 0) {
  const insertMany = db.transaction((herbs) => {
    for (const herb of herbs) insert.run(herb);
  });
  insertMany(seedData);
  console.log('Database seeded with initial herbs.');
}

// Always try to sync from Excel on startup
syncFromExcel();

export default db;
