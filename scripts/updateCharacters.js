import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

/*
=====================================================
CONFIGURATIE
=====================================================
*/

const WIKI_API =
    "https://dreamlightvalleywiki.com/api.php";

const WIKI_BASE =
    "https://dreamlightvalleywiki.com/";

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
);


/*
=====================================================
CONTROLE
=====================================================
*/

if (!SUPABASE_URL) {
    throw new Error(
        "SUPABASE_URL ontbreekt in de GitHub Secrets."
    );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY ontbreekt in de GitHub Secrets."
    );
}


/*
=====================================================
ALGEMENE HULPFUNCTIES
=====================================================
*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function cleanText(text) {

    if (!text) {
        return "";
    }

    return text
        .replace(/\s+/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();

}


/*
=====================================================
ID MAKEN
=====================================================
*/

function createId(name) {

    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

}


/*
=====================================================
MEDIAWIKI API
=====================================================
*/

/*
    We halen alle pagina's op die onder de categorie
    "Characters" vallen.

    Daarna controleren we per pagina of het daadwerkelijk
    een Character is.
*/

async function getCharacterPageTitles() {

    console.log(
        "Wiki: karakterpagina's ophalen..."
    );

    const titles = [];

    let continueToken = null;

    do {

        const params = {

            action: "query",

            format: "json",

            list: "categorymembers",

            cmtitle: "Category:Characters",

            cmnamespace: 0,

            cmlimit: "max"

        };

        if (continueToken) {

            params.cmcontinue =
                continueToken;

        }

        const response = await axios.get(
            WIKI_API,
            {
                params,
                headers: {
                    "User-Agent":
                        "DDV-Character-Tracker/1.0"
                },
                timeout: 30000
            }
        );

        const data = response.data;

        if (
            !data.query ||
            !data.query.categorymembers
        ) {

            throw new Error(
                "Geen karakterpagina's ontvangen van de wiki."
            );

        }

        for (
            const page
            of data.query.categorymembers
        ) {

            if (
                page.ns === 0 &&
                page.title
            ) {

                titles.push(
                    page.title
                );

            }

        }

        continueToken =
            data.continue?.cmcontinue || null;

    } while (continueToken);


    /*
        Dubbele titels verwijderen.
    */

    return [
        ...new Set(titles)
    ];

}


/*
=====================================================
PAGINA OPHALEN
=====================================================
*/

async function getWikiPage(title) {

    const response = await axios.get(
        WIKI_API,
        {
            params: {

                action: "parse",

                page: title,

                prop: "text|categories",

                format: "json",

                redirects: 1

            },

            headers: {

                "User-Agent":
                    "DDV-Character-Tracker/1.0"

            },

            timeout: 30000

        }
    );


    if (
        !response.data ||
        !response.data.parse
    ) {

        throw new Error(
            `Wiki-pagina kon niet worden gelezen: ${title}`
        );

    }


    return response.data.parse;

}


/*
=====================================================
INFOBOX WAARDE OPHALEN
=====================================================
*/

function getInfoboxValue(
    $,
    label
) {

    let result = "";


    $("table").each(
        (_, table) => {

            if (result) {
                return;
            }


            const rows =
                $(table).find("tr");


            rows.each(
                (_, row) => {

                    if (result) {
                        return;
                    }


                    const cells =
                        $(row).find(
                            "th, td"
                        );


                    if (
                        cells.length < 2
                    ) {

                        return;

                    }


                    const first =
                        cleanText(
                            $(cells[0])
                                .text()
                        );


                    if (
                        first
                            .toLowerCase()
                            .includes(
                                label.toLowerCase()
                            )
                    {

                        result =
                            cleanText(
                                $(cells[1])
                                    .text()
                            );

                    }

                }
            );

        }
    );


    return result;

}


/*
=====================================================
AFBEELDING OPHALEN
=====================================================
*/

function getCharacterImage(
    $,
    title
) {

    /*
        Eerst proberen we de hoofdafbeelding
        uit de infobox te halen.
    */

    let image = "";


    $("table").each(
        (_, table) => {

            if (image) {
                return;
            }


            const rows =
                $(table).find("tr");


            rows.each(
                (_, row) => {

                    if (image) {
                        return;
                    }


                    const cells =
                        $(row).find(
                            "th, td"
                        );


                    if (
                        cells.length < 2
                    ) {

                        return;

                    }


                    const first =
                        cleanText(
                            $(cells[0])
                                .text()
                        );


                    if (
                        first
                            .toLowerCase()
                            .includes("type")
                    ) {

                        const img =
                            $(cells[1])
                                .find("img")
                                .first();


                        if (
                            img.length
                        ) {

                            image =
                                img.attr(
                                    "src"
                                ) || "";

                        }

                    }

                }
            );

        }
    );


    /*
        Als de infobox geen afbeelding
        oplevert, zoeken we naar een
        afbeelding met de paginanaam.
    */

    if (!image) {

        $("img").each(
            (_, img) => {

                if (image) {
                    return;
                }


                const src =
                    $(img).attr(
                        "src"
                    ) || "";


                const alt =
                    cleanText(
                        $(img).attr(
                            "alt"
                        ) || ""
                    );


                if (
                    alt
                        .toLowerCase()
                        .includes(
                            title.toLowerCase()
                        )
                ) {

                    image = src;

                }

            }
        );

    }


    if (!image) {

        return "";

    }


    /*
        Wiki gebruikt soms relatieve
        afbeeldings-URL's.
    */

    if (
        image.startsWith("//")
    ) {

        return "https:" + image;

    }


    if (
        image.startsWith("/")
    ) {

        return WIKI_BASE
            .replace(/\/$/, "")
            + image;

    }


    return image;

}


/*
=====================================================
COLLECTIE BEPALEN
=====================================================
*/

function getCollection(
    parsedPage
) {

    const categories =
        parsedPage.categories || [];


    /*
        We zoeken expliciet naar:

        Dreamlight Valley Characters Collection
        Eternity Isle Characters Collection
        Storybook Vale Characters Collection
        enz.

        Dit voorkomt dat we de algemene
        "Collection: Dreamlight Valley"
        uit de infobox gebruiken.
    */

    for (
        const category
        of categories
    ) {

        const name =
            category["*"] ||
            category.title ||
            "";


        const match =
            name.match(
                /^(.+?) Characters Collection$/i
            );


        if (match) {

            return cleanText(
                match[1]
            );

        }

    }


    return "";

}


/*
=====================================================
FILM BEPALEN
=====================================================
*/

function getMovie(
    $,
    title
) {

    /*
        De "From" waarde in de infobox
        bevat normaal gesproken de
        Disney-film/franchise.
    */

    const movie =
        getInfoboxValue(
            $,
            "From"
        );


    if (movie) {

        return movie;

    }


    /*
        Fallback:
        de tweede regel in de infobox
        bevat bij veel pagina's de film.
    */

    let fallback = "";


    $("table").each(
        (_, table) => {

            if (fallback) {
                return;
            }


            const rows =
                $(table).find("tr");


            if (
                rows.length >= 2
            ) {

                const row =
                    rows.eq(1);


                const cells =
                    row.find(
                        "th, td"
                    );


                if (
                    cells.length === 1
                ) {

                    fallback =
                        cleanText(
                            cells
                                .first()
                                .text()
                        );

                }

            }

        }
    );


    return fallback;

}


/*
=====================================================
KARAKTER VERWERKEN
=====================================================
*/

async function parseCharacter(
    title
) {

    const parsed =
        await getWikiPage(
            title
        );


    const html =
        parsed.text["*"];


    const $ =
        cheerio.load(
            html
        );


    /*
        Controleer eerst Type.
    */

    const type =
        getInfoboxValue(
            $,
            "Type"
        );


    if (
        type.toLowerCase()
            !== "character"
    ) {

        return null;

    }


    /*
        Naam
    */

    let name =
        cleanText(
            $("h1")
                .first()
                .text()
        );


    if (!name) {

        name = title;

    }


    /*
        Film
    */

    const movie =
        getMovie(
            $,
            title
        );


    /*
        Collectie / uitbreiding
    */

    const collection =
        getCollection(
            parsed
        );


    /*
        Afbeelding
    */

    const image =
        getCharacterImage(
            $,
            title
        );


    /*
        ID
    */

    const id =
        createId(
            name
        );


    return {

        id,

        name,

        movie,

        collection,

        image

    };

}


/*
=====================================================
SUPABASE BESTAANDE RECORDS
=====================================================
*/

async function getExistingCharacters() {

    console.log(
        "Supabase: bestaande characters ophalen..."
    );


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
            `Supabase fout bij ophalen: ${error.message}`
        );

    }


    return data || [];

}


/*
=====================================================
CHARACTER OPSLAAN
=====================================================
*/

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
                onConflict: "id"
            }

        );


    if (error) {

        throw new Error(
            `Supabase fout bij ${character.name}: ${error.message}`
        );

    }

}


/*
=====================================================
VERGELIJKEN
=====================================================
*/

function characterChanged(
    oldCharacter,
    newCharacter
) {

    return (

        oldCharacter.name
            !== newCharacter.name

        ||

        oldCharacter.movie
            !== newCharacter.movie

        ||

        oldCharacter.collection
            !== newCharacter.collection

        ||

        oldCharacter.image
            !== newCharacter.image

    );

}


/*
=====================================================
HOOFDFUNCTIE
=====================================================
*/

async function syncCharacters() {

    console.log(
        "========================================"
    );

    console.log(
        "Dreamlight Valley Character Sync"
    );

    console.log(
        "========================================"
    );


    /*
        1. Wiki-pagina's ophalen
    */

    const titles =
        await getCharacterPageTitles();


    console.log(
        `Wiki: ${titles.length} pagina's gevonden.`
    );


    /*
        2. Bestaande database ophalen
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


    let added = 0;

    let updated = 0;

    let unchanged = 0;

    let errors = 0;


    /*
        3. Iedere pagina verwerken
    */

    for (
        const title
        of titles
    ) {

        try {

            console.log(
                `Controleren: ${title}`
            );


            const character =
                await parseCharacter(
                    title
                );


            /*
                Geen Character?
                Dan overslaan.
            */

            if (!character) {

                console.log(
                    `  → overgeslagen`
                );

                continue;

            }


            const oldCharacter =
                existingMap.get(
                    character.id
                );


            /*
                Nieuw karakter
            */

            if (!oldCharacter) {

                await saveCharacter(
                    character
                );


                added++;


                console.log(
                    `  → NIEUW: ${character.name}`
                );

            }


            /*
                Bestaand karakter gewijzigd
            */

            else if (
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
                    `  → GEWIJZIGD: ${character.name}`
                );

            }


            /*
                Geen wijzigingen
            */

            else {

                unchanged++;

            }


            /*
                Kleine pauze om de wiki
                niet onnodig zwaar te belasten.
            */

            await sleep(250);

        }

        catch (error) {

            errors++;


            console.error(
                `  → FOUT bij ${title}:`
            );


            console.error(
                error.message
            );

        }

    }


    /*
        4. Resultaat
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
        `Gevonden:       ${titles.length}`
    );

    console.log(
        `Nieuw:          ${added}`
    );

    console.log(
        `Gewijzigd:      ${updated}`
    );

    console.log(
        `Ongewijzigd:    ${unchanged}`
    );

    console.log(
        `Fouten:         ${errors}`
    );

    console.log(
        "========================================"
    );


    /*
        Als er fouten waren, laten we de
        GitHub Action falen.

        Bestaande records worden hierdoor
        NIET verwijderd.
    */

    if (errors > 0) {

        throw new Error(
            `${errors} karakterpagina('s) konden niet worden verwerkt.`
        );

    }

}


/*
=====================================================
START
=====================================================
*/

syncCharacters()

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
