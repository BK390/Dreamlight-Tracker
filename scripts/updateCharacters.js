import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const WIKI_API = "https://dreamlightvalleywiki.com/api.php";
const USER_AGENT = "DDV-Tracker-Character-Sync/1.0";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL ontbreekt.");
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY ontbreekt.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


/* =====================================================
   TEKST OPSCHONEN
===================================================== */

function cleanText(value = "") {
  return value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}


/* =====================================================
   ID MAKEN
===================================================== */

function createId(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


/* =====================================================
   WIKI API
===================================================== */

async function wikiGet(params) {
  try {
    const response = await axios.get(WIKI_API, {
      params: {
        ...params,
        format: "json",
        formatversion: 2
      },

      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DDV-Tracker/1.0)",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9"
      },

      timeout: 30000,

      validateStatus: () => true
    });

    if (response.status !== 200) {
      console.error("");
      console.error("========================================");
      console.error("WIKI REQUEST FOUT");
      console.error("========================================");
      console.error(`HTTP status: ${response.status}`);
      console.error(`URL: ${response.config.url}`);
      console.error(`Request: ${JSON.stringify(params)}`);
      console.error("Response:");
      console.error(
        typeof response.data === "string"
          ? response.data.substring(0, 1000)
          : JSON.stringify(response.data).substring(0, 1000)
      );
      console.error("========================================");

      throw new Error(
        `Dreamlight Valley Wiki gaf HTTP ${response.status}`
      );
    }

    if (response.data?.error) {
      throw new Error(
        response.data.error.info ||
        "MediaWiki API fout"
      );
    }

    return response.data;

  } catch (error) {

    if (
      error.message &&
      error.message.startsWith(
        "Dreamlight Valley Wiki gaf HTTP"
      )
    ) {
      throw error;
    }

    throw new Error(
      `Wiki aanvraag mislukt: ${error.message}`
    );
  }
}


/* =====================================================
   ALLE PAGINA'S UIT CATEGORY:CHARACTERS
===================================================== */

async function getCharacterTitles() {

  const titles = [];

  let cmcontinue;

  do {

    const params = {
      action: "query",
      list: "categorymembers",
      cmtitle: "Category:Characters",
      cmnamespace: 0,
      cmtype: "page",
      cmlimit: "max"
    };

    if (cmcontinue) {
      params.cmcontinue = cmcontinue;
    }

    const data = await wikiGet(params);

    const members =
      data.query?.categorymembers || [];

    for (const member of members) {

      if (
        member.ns === 0 &&
        member.title
      ) {

        titles.push(member.title);

      }

    }

    cmcontinue =
      data.continue?.cmcontinue;

  } while (cmcontinue);


  return [
    ...new Set(titles)
  ];

}


/* =====================================================
   INDIVIDUELE WIKI PAGINA
===================================================== */

async function getPage(title) {

  const data = await wikiGet({

    action: "parse",

    page: title,

    prop: "text|categories",

    redirects: 1

  });


  if (!data.parse) {

    throw new Error(
      `Pagina niet gevonden: ${title}`
    );

  }


  return data.parse;

}


/* =====================================================
   INFOBOX RIJ VINDEN
===================================================== */

function getInfoboxRow($, label) {

  let result = null;


  $("table").each((_, table) => {

    if (result) {
      return;
    }


    $(table).find("tr").each((_, row) => {

      if (result) {
        return;
      }


      const cells =
        $(row).find("th, td");


      if (cells.length < 2) {
        return;
      }


      const key =
        cleanText(
          $(cells[0]).text()
        ).replace(/:$/, "");


      if (
        key.toLowerCase() ===
        label.toLowerCase()
      ) {

        result =
          cells.eq(1);

      }

    });

  });


  return result;

}


/* =====================================================
   INFOBOX WAARDE
===================================================== */

function getInfoboxValue($, label) {

  const cell =
    getInfoboxRow(
      $,
      label
    );


  if (!cell) {
    return "";
  }


  return cleanText(
    cell.text()
  );

}


/* =====================================================
   FILM / UNIVERSUM
===================================================== */

function getMovie($) {

  const cell =
    getInfoboxRow(
      $,
      "From"
    );


  if (!cell) {
    return "";
  }


  /*
     De wiki gebruikt hier meestal
     een link naar het betreffende
     Disney-universum.
  */

  const link =
    cell.find("a").first();


  if (link.length) {

    const text =
      cleanText(
        link.text()
      );


    if (text) {
      return text;
    }


    const title =
      cleanText(
        link.attr("title") || ""
      );


    if (title) {

      return title
        .replace(
          /^Image:\s*/i,
          ""
        )
        .replace(
          /\.png$/i,
          ""
        );

    }

  }


  let value =
    cleanText(
      cell.text()
    );


  value =
    value.replace(
      /^Image\s*/i,
      ""
    );


  value =
    value.replace(
      /\.png$/i,
      ""
    );


  return value;

}


/* =====================================================
   COLLECTION
===================================================== */

function getCollection(parsed) {

  const categories =
    parsed.categories || [];


  for (
    const category
    of categories
  ) {

    const name =
      cleanText(
        category.title ||
        category["*"] ||
        ""
      );


    const match =
      name.match(
        /^(.+?) Characters Collection$/i
      );


    if (match) {

      return match[1].trim();

    }

  }


  return "";

}


/* =====================================================
   AFBEELDING
===================================================== */

async function getImage(title) {

  const data =
    await wikiGet({

      action: "query",

      titles: title,

      prop: "pageimages",

      piprop: "original"

    });


  const pages =
    data.query?.pages || [];


  const page =
    pages[0];


  return (
    page?.original?.source ||
    ""
  );

}


/* =====================================================
   KARAKTER VERWERKEN
===================================================== */

async function parseCharacter(title) {

  const parsed =
    await getPage(title);


  const html =
    parsed.text || "";


  const $ =
    cheerio.load(html);


  /*
     Alleen pagina's die daadwerkelijk
     bij een Characters Collection horen.

     Hiermee wordt bijvoorbeeld
     The Lorekeeper automatisch uitgesloten.
  */

  const collection =
    getCollection(parsed);


  if (!collection) {

    return null;

  }


  /*
     Extra controle op het Type.
  */

  const type =
    getInfoboxValue(
      $,
      "Type"
    );


  if (
    type &&
    type.toLowerCase() !==
      "character"
  ) {

    return null;

  }


  const name =
    cleanText(
      parsed.title ||
      title
    );


  const movie =
    getMovie($);


  const image =
    await getImage(title);


  return {

    id:
      createId(name),

    name,

    movie,

    collection,

    image

  };

}


/* =====================================================
   BESTAANDE SUPABASE RECORDS
===================================================== */

async function getExisting() {

  const {
    data,
    error
  } = await supabase

    .from(
      "characters_master"
    )

    .select(
      "id,name,movie,collection,image"
    );


  if (error) {

    throw new Error(
      `Supabase ophalen mislukt: ${error.message}`
    );

  }


  return data || [];

}


/* =====================================================
   CONTROLEREN OF RECORD GEWIJZIGD IS
===================================================== */

function changed(
  oldRow,
  newRow
) {

  return [
    "name",
    "movie",
    "collection",
    "image"
  ].some(

    (field) =>
      (oldRow[field] || "") !==
      (newRow[field] || "")

  );

}


/* =====================================================
   OPSLAAN
===================================================== */

async function upsertCharacter(
  character
) {

  const {
    error
  } = await supabase

    .from(
      "characters_master"
    )

    .upsert(

      character,

      {
        onConflict: "id"
      }

    );


  if (error) {

    throw new Error(
      `Opslaan mislukt: ${error.message}`
    );

  }

}


/* =====================================================
   HOOFDFUNCTIE
===================================================== */

async function main() {

  console.log(
    "========================================"
  );

  console.log(
    "DDV Character Database Sync"
  );

  console.log(
    "========================================"
  );


  /*
     Wiki-karakters ophalen
  */

  const titles =
    await getCharacterTitles();


  console.log(
    `Wiki: ${titles.length} pagina's in Category:Characters.`
  );


  /*
     Bestaande database ophalen
  */

  const existing =
    await getExisting();


  const existingMap =
    new Map(
      existing.map(
        (row) => [
          row.id,
          row
        ]
      )
    );


  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let errors = 0;


  /*
     Iedere karakterpagina controleren
  */

  for (
    const title
    of titles
  ) {

    try {

      const character =
        await parseCharacter(
          title
        );


      /*
         Geen geldig tracker-karakter
      */

      if (!character) {

        skipped++;

        console.log(
          `SKIP  ${title}`
        );

        continue;

      }


      const oldRow =
        existingMap.get(
          character.id
        );


      /*
         Nieuw karakter
      */

      if (!oldRow) {

        await upsertCharacter(
          character
        );

        added++;

        console.log(
          `NEW   ${character.name} (${character.collection})`
        );

      }


      /*
         Bestaand karakter gewijzigd
      */

      else if (
        changed(
          oldRow,
          character
        )
      ) {

        await upsertCharacter(
          character
        );

        updated++;

        console.log(
          `UPDATE ${character.name} (${character.collection})`
        );

      }


      /*
         Geen wijzigingen
      */

      else {

        unchanged++;

      }


      /*
         Kleine pauze tussen
         wiki-aanvragen
      */

      await sleep(200);

    }

    catch (error) {

      errors++;

      console.error(
        `ERROR ${title}: ${error.message}`
      );

    }

  }


  /*
     Resultaat
  */

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "Synchronisatie voltooid"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Wiki characters: ${titles.length}`
  );

  console.log(
    `Nieuw:           ${added}`
  );

  console.log(
    `Gewijzigd:       ${updated}`
  );

  console.log(
    `Ongewijzigd:     ${unchanged}`
  );

  console.log(
    `Overgeslagen:    ${skipped}`
  );

  console.log(
    `Fouten:          ${errors}`
  );

  console.log(
    "========================================"
  );


  /*
     Bij fouten laten we GitHub
     de workflow als mislukt markeren.
  */

  if (errors > 0) {

    throw new Error(
      `${errors} pagina('s) konden niet worden verwerkt.`
    );

  }

}


/* =====================================================
   START
===================================================== */

main().catch(
  (error) => {

    console.error("");

    console.error(
      "SYNC MISLUKT"
    );

    console.error(
      error.message
    );

    process.exit(1);

  }
);
