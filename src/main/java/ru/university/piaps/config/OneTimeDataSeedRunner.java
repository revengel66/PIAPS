package ru.university.piaps.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Slf4j
@Component
@RequiredArgsConstructor
public class OneTimeDataSeedRunner implements ApplicationRunner {

    private static final String SEED_STATE_TABLE = "app_seed_state";
    private static final String SEED_STATE_DDL = """
            CREATE TABLE IF NOT EXISTS app_seed_state (
                seed_key VARCHAR(128) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                details VARCHAR(255)
            )
            """;
    private static final String SEED_EXISTS_SQL = "SELECT COUNT(*) FROM app_seed_state WHERE seed_key = ?";
    private static final String SEED_INSERT_SQL = """
            INSERT INTO app_seed_state(seed_key, details)
            VALUES (?, ?)
            ON CONFLICT (seed_key) DO NOTHING
            """;
    private static final String REGCLASS_SQL = "SELECT to_regclass(?)";

    private final DataSource dataSource;
    private final ResourceLoader resourceLoader;

    @Value("${app.seed.enabled:true}")
    private boolean enabled;

    @Value("${app.seed.key:main-data-v1}")
    private String seedKey;

    @Value("${app.seed.script:classpath:data.sql}")
    private String seedScript;

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            log.info("One-time seed is disabled by config.");
            return;
        }

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute(SEED_STATE_DDL);

        Integer alreadyApplied = jdbc.queryForObject(SEED_EXISTS_SQL, Integer.class, seedKey);
        if (alreadyApplied != null && alreadyApplied > 0) {
            log.info("One-time seed '{}' already applied. Skipping.", seedKey);
            return;
        }

        if (hasExistingData(jdbc)) {
            jdbc.update(SEED_INSERT_SQL, seedKey, "Seed marked as applied because existing data was detected");
            log.info("Existing data detected. Seed '{}' marked as applied without reseeding.", seedKey);
            return;
        }

        Resource script = resourceLoader.getResource(seedScript);
        if (!script.exists()) {
            log.warn("Seed script '{}' not found. Skipping one-time seed.", seedScript);
            return;
        }

        log.info("Applying one-time seed '{}' from '{}'.", seedKey, seedScript);
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(script);
        populator.setContinueOnError(false);
        populator.setIgnoreFailedDrops(true);
        populator.setSqlScriptEncoding("UTF-8");
        DatabasePopulatorUtils.execute(populator, dataSource);
        jdbc.update(SEED_INSERT_SQL, seedKey, "Seed data.sql applied successfully");
        log.info("One-time seed '{}' applied successfully.", seedKey);
    }

    private boolean hasExistingData(JdbcTemplate jdbc) {
        if (!tableExists(jdbc, "faculties")) {
            return false;
        }
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM faculties", Integer.class);
        return count != null && count > 0;
    }

    private boolean tableExists(JdbcTemplate jdbc, String tableName) {
        String qualified = "public." + tableName;
        String regClass = jdbc.queryForObject(REGCLASS_SQL, String.class, qualified);
        return regClass != null;
    }
}
