package ru.university.piaps.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.stream.Collectors;

@Component
public class ApplicationLifecycleLogger {

    private static final Logger OPERATION_LOG = LoggerFactory.getLogger("OPERATION_LOGGER");

    private final Environment environment;

    public ApplicationLifecycleLogger(Environment environment) {
        this.environment = environment;
    }

    @EventListener
    public void onReady(ApplicationReadyEvent event) {
        String profiles = Arrays.stream(environment.getActiveProfiles()).collect(Collectors.joining(", "));
        if (profiles.isBlank()) {
            profiles = "default";
        }
        String port = environment.getProperty("server.port", "8080");
        OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Приложение запущено. Порт={} | Активные профили={}", port, profiles);
    }

    @EventListener
    public void onClosed(ContextClosedEvent event) {
        OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Приложение завершает работу.");
    }
}
