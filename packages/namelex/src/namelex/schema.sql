PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS surname (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL UNIQUE,  -- display form
    norm          TEXT    NOT NULL,         -- comparison form
    skeleton      TEXT    NOT NULL,         -- aggressive orthographic key
    cologne       TEXT    NOT NULL,         -- Cologne phonetic code
    prefix        TEXT    NOT NULL DEFAULT '',
    length        INTEGER NOT NULL,
    count_onomaverse INTEGER NOT NULL DEFAULT 0,
    count_wikidata   INTEGER NOT NULL DEFAULT 0,
    count_gnd        INTEGER NOT NULL DEFAULT 0,
    prob          REAL    NOT NULL DEFAULT 0.0,  -- P(surname = name)
    log_prob      REAL    NOT NULL DEFAULT 0.0,
    plausibility  REAL    NOT NULL DEFAULT 0.0,  -- length-normalised n-gram score
    rank_de       INTEGER,
    origin        TEXT    NOT NULL DEFAULT '',
    sources       TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_surname_norm     ON surname(norm);
CREATE INDEX IF NOT EXISTS idx_surname_skeleton ON surname(skeleton);
CREATE INDEX IF NOT EXISTS idx_surname_cologne  ON surname(cologne);
CREATE INDEX IF NOT EXISTS idx_surname_length   ON surname(length);
CREATE INDEX IF NOT EXISTS idx_surname_prob     ON surname(prob DESC);

-- Alternative spellings of the same name, from Wikidata aliases and GND
-- variant name entries. Doubles as the gold set for threshold calibration.
CREATE TABLE IF NOT EXISTS variant (
    surname_id INTEGER NOT NULL REFERENCES surname(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    norm       TEXT    NOT NULL,
    cologne    TEXT    NOT NULL,
    source     TEXT    NOT NULL,
    PRIMARY KEY (surname_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variant_norm    ON variant(norm);
CREATE INDEX IF NOT EXISTS idx_variant_cologne ON variant(cologne);

-- Character n-gram model over the lexicon, used to score names that carry
-- no frequency of their own.
CREATE TABLE IF NOT EXISTS ngram (
    gram  TEXT    NOT NULL,
    n     INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (gram, n)
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
