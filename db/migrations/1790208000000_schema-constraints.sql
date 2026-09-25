-- Up Migration

-- athletes: owner_key is set exactly when the athlete is user-owned. Written as
-- "source = 'user'" rather than "source = 'seed'" so a future 'tfrrs' source
-- (also unowned) doesn't need this constraint rewritten.
ALTER TABLE athletes
    ADD CONSTRAINT athletes_owner_matches_source
        CHECK ((source = 'user') = (owner_key IS NOT NULL)),
    -- Target for the composite FK below.
    ADD CONSTRAINT athletes_id_source_key UNIQUE (id, source);

-- performances: legal becomes computed, season is added, and the loose columns
-- get the constraints they were missing.
ALTER TABLE performances DROP COLUMN legal;

ALTER TABLE performances
    -- Indoor seasons run Dec–Mar, so the season can't be derived from the date
    -- alone (March has both indoor nationals and outdoor openers). The meet says
    -- which season it is; the year label is derived.
    ADD COLUMN season_type text NOT NULL CHECK (season_type IN ('indoor', 'outdoor')),
    ALTER COLUMN meet_date SET NOT NULL,
    ALTER COLUMN meet_name SET NOT NULL,
    ADD CONSTRAINT performances_mark_positive CHECK (mark_cm > 0 AND mark_cm < 2000),
    -- No wind reading exists for HJ or for anything indoors.
    ADD CONSTRAINT performances_wind_only_outdoor_horizontal
        CHECK (wind IS NULL OR (event <> 'HJ' AND season_type = 'outdoor')),
    -- A performance's source always matches its athlete's source.
    DROP CONSTRAINT performances_athlete_id_fkey,
    ADD CONSTRAINT performances_athlete_fkey
        FOREIGN KEY (athlete_id, source) REFERENCES athletes (id, source) ON DELETE CASCADE;

-- Indoor meets from August on belong to the next calendar year's season
-- (a December 2025 meet is part of indoor 2026).
ALTER TABLE performances
    ADD COLUMN season_year integer GENERATED ALWAYS AS (
        CASE
            WHEN season_type = 'indoor' AND extract(month FROM meet_date) >= 8
                THEN extract(year FROM meet_date)::integer + 1
            ELSE extract(year FROM meet_date)::integer
        END
    ) STORED;

-- Legal for records and lists: HJ and indoor marks have no wind to exceed.
-- An outdoor LJ/TJ with no reading (NWI) is not legal.
ALTER TABLE performances
    ADD COLUMN legal boolean GENERATED ALWAYS AS (
        event = 'HJ' OR season_type = 'indoor' OR (wind IS NOT NULL AND wind <= 2.0)
    ) STORED;

-- Progression / PR: one athlete's marks in one event.
CREATE INDEX performances_athlete_event_idx ON performances (athlete_id, event);
-- Rankings / percentile / target: the whole seeded field for one event.
CREATE INDEX performances_field_idx ON performances (event, source, athlete_id, mark_cm) WHERE legal;

-- Down Migration

DROP INDEX performances_field_idx;
DROP INDEX performances_athlete_event_idx;

ALTER TABLE performances
    DROP COLUMN legal,
    DROP COLUMN season_year,
    DROP CONSTRAINT performances_athlete_fkey,
    ADD CONSTRAINT performances_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes (id),
    DROP CONSTRAINT performances_wind_only_outdoor_horizontal,
    DROP CONSTRAINT performances_mark_positive,
    ALTER COLUMN meet_name DROP NOT NULL,
    ALTER COLUMN meet_date DROP NOT NULL,
    DROP COLUMN season_type,
    ADD COLUMN legal boolean;

ALTER TABLE athletes
    DROP CONSTRAINT athletes_id_source_key,
    DROP CONSTRAINT athletes_owner_matches_source;
