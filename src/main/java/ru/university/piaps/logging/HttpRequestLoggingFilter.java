package ru.university.piaps.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HttpRequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger OPERATION_LOG = LoggerFactory.getLogger("OPERATION_LOGGER");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri == null || !uri.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        String actor = resolveActor(request);

        MDC.put("requestId", requestId);
        MDC.put("actor", actor);

        long startedAt = System.currentTimeMillis();
        String method = request.getMethod();
        String uri = request.getRequestURI();
        String query = request.getQueryString();
        String fullPath = query == null || query.isBlank() ? uri : (uri + "?" + query);

        OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Входящий запрос: {} {} | IP={} | Агент={}",
                method, fullPath, request.getRemoteAddr(), abbreviate(request.getHeader("User-Agent"), 120));
        try {
            filterChain.doFilter(request, response);
        } catch (Exception ex) {
            String source = ErrorLogSupport.sourceLink(ex);
            OPERATION_LOG.error("[ОПЕРАЦИОННАЯ ОШИБКА] {} {} | расшифровка={} | источник={}",
                    method, fullPath, ErrorLogSupport.rootMessage(ex), source, ex);
            throw ex;
        } finally {
            long duration = System.currentTimeMillis() - startedAt;
            OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Ответ: {} {} -> HTTP {} ({} мс)",
                    method, fullPath, response.getStatus(), duration);
            MDC.clear();
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String header = request.getHeader("X-Request-Id");
        if (header != null && !header.isBlank()) {
            return header.trim();
        }
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private String resolveActor(HttpServletRequest request) {
        String fromHeaders = firstNonBlank(
                request.getHeader("X-User"),
                request.getHeader("X-Actor"),
                request.getHeader("X-Username")
        );
        if (fromHeaders != null) {
            return fromHeaders;
        }
        if (request.getRemoteUser() != null && !request.getRemoteUser().isBlank()) {
            return request.getRemoteUser().trim();
        }
        return "Аноним";
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String abbreviate(String value, int limit) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        if (normalized.length() <= limit) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, limit - 3)) + "...";
    }
}
