import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const SOURCE_URL =
  "https://www.mydreamlightvalley.com/en/character/";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY;


/* =====================================================
   CONTROLE
===================================================== */

if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL ontbreekt."
  );
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_KEY ontbreekt."
  );
}


const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY
  );


/* =====================================================
   WORLD → COLLECTION
===================================================== */

const WORLD_NAMES = {

  world_xbas:
    "Dreamlight Valley",

  world_xtny:
    "Eternity Isle",

  world_xsbv:
    "Storybook Vale",

  world_xwis:
    "Wishblossom Mountains",

  world_xhny:
    "Honeyglow Woods"

};


/* =====================================================
   TEKST OPSCHONEN
===================================================== */

function cleanText(
  value = ""
) {

  return value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

}


/* =====================================================
   ID MAKEN
===================================================== */

function createId(
  name
) {

  return name

    .normalize("NFD")

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .toLowerCase()

    .replace(
      /&/g,
      "and"
    )

    .replace(
      /['’]/g,
      ""
    )

    .replace(
      /[^a-z0-9]+/g,
      "-"
    )

    .replace(
      /^-+|-+$/g,
      "");

}


/* =====================================================
   AFBEELDING URL NORMALISEREN
===================================================== */

function normalizeImageUrl(
  src
) {

  if (!src) {
    return "";
  }


  if (
    src.startsWith("//")
  ) {

    return "https:" + src;

  }


  if (
    src.startsWith("/")
  ) {

    return (
      "https://www.mydreamlightvalley.com"
      + src
    );

  }


  if (
    src.startsWith("http://") ||
    src.startsWith("https://")
  ) {

    return src;

  }


  return "";

}


/* =====================================================
   CHARACTER TABEL VINDEN
===================================================== */

function findCharacterTable(
  $
) {

  let bestTable = null;

  let bestScore = 0;


  $("table").each(
    (_, table) => {

      const text =
        cleanText(
          $(table).text()
        );


      let score = 0;


      if (
        text.includes("Name")
      ) {
        score += 2;
      }


      if (
        text.includes("Universe")
      ) {
        score += 2;
      }


      if (
        text.includes("World")
      ) {
        score += 2;
      }


      if (
        text.includes("His/Her Level")
      ) {
        score += 1;
      }


      if (
        score > bestScore
      ) {

        bestScore =
          score;

        bestTable =
          table;

      }

    }
  );


  return bestTable;

}


/* =====================================================
   HEADER INDEXEN BEPALEN
===================================================== */

function getHeaderIndexes(
  $,
  table
) {

  const headers = [];

  $(table)
    .find("tr")
    .first()
    .find("th, td")
    .each(
      (_, cell) => {

        headers.push(
          cleanText(
            $(cell).text()
          ).toLowerCase()
        );

      }
    );


  return {

    world:
      headers.findIndex(
        h => h === "world"
      ),

    name:
      headers.findIndex(
        h => h === "name"
      ),

    universe:
      headers.findIndex(
        h => h === "universe"
      ),

    image:
      headers.findIndex(
        h => h === "image"
      )

  };

}


/* =====================================================
   IMAGE UIT RIJ HALEN
===================================================== */

function getImageFromRow(
  $,
  row,
  imageIndex
) {

  let image = "";


  const cells =
    $(row).find(
      "td, th"
    );


  /*
     Eerst de Image-kolom proberen.
  */

  if (
    imageIndex >= 0 &&
    cells.eq(imageIndex).length
  ) {

    const img =
      cells
        .eq(imageIndex)
        .find("img")
        .first();


    if (img.length) {

      image =
        img.attr("src") ||
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        "";

    }

  }


  /*
     Fallback: zoek iedere afbeelding
     in de rij.
  */

  if (!image) {

    cells
      .find("img")
      .each(
        (_, img) => {

          if (image) {
            return;
          }


          image =
            $(img).attr("src") ||
            $(img).attr("data-src") ||
            $(img).attr("data-lazy-src") ||
            "";

        }
      );

  }


  return normalizeImageUrl(
    image
  );

}


/* =====================================================
   KARAKTERS UITLEZEN
===================================================== */

async function getCharactersFromWebsite() {

  console.log(
    "Bron ophalen:"
  );

  console.log(
    SOURCE_URL
  );


  const response =
    await axios.get(
      SOURCE_URL,
      {

        headers: {

          "User-Agent":
            USER_AGENT,

          "Accept":
            "text/html,application/xhtml+xml",

          "Accept-Language":
            "en-US,en;q=0.9"

        },

        timeout: 30000

      }
    );


  if (
    response.status !== 200
  ) {

    throw new Error(
      `MyDreamlightValley gaf HTTP ${response.status}`
    );

  }


  const $
    = cheerio.load(
      response.data
    );


  const table =
    findCharacterTable(
      $
    );


  if (!table) {

    throw new Error(
      "De character-tabel kon niet worden gevonden."
    );

  }


  const indexes =
    getHeaderIndexes(
      $,
      table
    );


  console.log(
    "Kolommen gevonden:"
  );

  console.log(
    indexes
  );


  if (
    indexes.name === -1 ||
    indexes.universe === -1 ||
    indexes.world === -1
  ) {

    throw new Error(
      "De verwachte kolommen Name, Universe en World zijn niet gevonden."
    );

  }


  const characters = [];


  $(table)
    .find("tr")
    .slice(1)
    .each(
      (_, row) => {

        const cells =
          $(row).find(
            "td, th"
          );


        if (
          cells.length === 0
        ) {

          return;

        }


        const name =
          cleanText(
            cells
              .eq(indexes.name)
              .text()
          );


        const universe =
          cleanText(
            cells
              .eq(indexes.universe)
              .text()
          );


        const world =
          cleanText(
            cells
              .eq(indexes.world)
              .text()
          );


        /*
           Geen naam = geen character.
        */

        if (!name) {

          return;

        }


        /*
           Sommige tabelrijen kunnen
           ondersteunende informatie bevatten.
        */

        if (
          name === "Name" ||
          name === "Image"
        ) {

          return;

        }


        /*
           World is bijvoorbeeld:
           world_xbas
           world_xtny
           world_xsbv
           world_xwis
           world_xhny
        */

        const collection =
          WORLD_NAMES[world] ||
          world;


        const image =
          getImageFromRow(
            $,
            row,
            indexes.image
          );


        characters.push({

          id:
            createId(name),

          name,

          movie:
            universe,

          collection,

          image

        });

      }
    );


  /*
     Dubbele characters verwijderen.
  */

  const unique =
    new Map();


  for (
    const character
    of characters
  ) {

    if (
      !unique.has(
        character.id
      )
    ) {

      unique.set(
        character.id,
        character
      );

    }

  }


  return [
    ...unique.values()
  ];

}


/* =====================================================
   BESTAANDE DATABASE OPHALEN
===================================================== */

async function getExistingCharacters() {

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
   RECORD VERANDERD?
===================================================== */

function characterChanged(
  oldCharacter,
  newCharacter
) {

  return (

    (oldCharacter.name || "") !==
      (newCharacter.name || "")

    ||

    (oldCharacter.movie || "") !==
      (newCharacter.movie || "")

    ||

    (oldCharacter.collection || "") !==
      (newCharacter.collection || "")

    ||

    (oldCharacter.image || "") !==
      (newCharacter.image || "")

  );

}


/* =====================================================
   CHARACTER OPSLAAN
===================================================== */

async function saveCharacter(
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
        onConflict:
          "id"
      }

    );


  if (error) {

    throw new Error(
      `Supabase opslaan mislukt voor ${character.name}: ${error.message}`
    );

  }

}


/* =====================================================
   HOOFDFUNCTIE
===================================================== */

async function main() {

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "DDV CHARACTER DATABASE SYNC"
  );

  console.log(
    "========================================"
  );

  console.log("");


  /*
     1. Website uitlezen
  */

  const characters =
    await getCharactersFromWebsite();


  console.log("");

  console.log(
    `Characters gevonden: ${characters.length}`
  );


  if (
    characters.length < 50
  ) {

    throw new Error(
      `Slechts ${characters.length} characters gevonden. De synchronisatie wordt afgebroken om te voorkomen dat een foutieve bron de database overschrijft.`
    );

  }


  /*
     2. Bestaande database
  */

  const existing =
    await getExistingCharacters();


  const existingMap =
    new Map(

      existing.map(
        character => [
          character.id,
          character
        ]
      )

    );


  console.log(
    `Bestaande records: ${existing.length}`
  );


  let added = 0;

  let updated = 0;

  let unchanged = 0;


  /*
     3. Synchroniseren
  */

  for (
    const character
    of characters
  ) {

    const oldCharacter =
      existingMap.get(
        character.id
      );


    /*
       Nieuw
    */

    if (!oldCharacter) {

      await saveCharacter(
        character
      );

      added++;

      console.log(
        `NEW     ${character.name} | ${character.collection} | ${character.movie}`
      );

      continue;

    }


    /*
       Gewijzigd
    */

    if (
      characterChanged(
        oldCharacter,
        character
      )
    ) {

      await saveCharacter(
        character
      );

      updated++;

      console.log(
        `UPDATE  ${character.name}`
      );

      continue;

    }


    /*
       Geen wijziging
    */

    unchanged++;

  }


  /*
     4. Resultaat
  */

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "SYNCHRONISATIE VOLTOOID"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Bron characters: ${characters.length}`
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
    "========================================"
  );

}


/* =====================================================
   START
===================================================== */

main()

  .catch(
    error => {

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
