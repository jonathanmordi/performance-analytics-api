-- Up Migration
CREATE TABLE api_keys (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key_hash text NOT NULL UNIQUE,
    label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE athletes (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    gender text NOT NULL CHECK (gender IN ('M', 'F')),
    source text NOT NULL CHECK (source IN ('seed', 'user')),
    owner_key integer REFERENCES api_keys(id)
);

CREATE TABLE performances (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    athlete_id integer NOT NULL REFERENCES athletes(id),
    event text NOT NULL CHECK (event IN ('LJ', 'TJ', 'HJ')),
    mark_cm integer NOT NULL,
    wind numeric(3,1),
    legal boolean,
    meet_name text,
    meet_date date,
    source text NOT NULL CHECK (source IN ('seed', 'user'))

);

-- Down Migration

DROP TABLE performances;
DROP TABLE athletes;
DROP TABLE api_keys;