package ru.university.piaps.logging;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

@Aspect
@Component
public class ApplicationLoggingAspect {

    private static final Logger OPERATION_LOG = LoggerFactory.getLogger("OPERATION_LOGGER");
    private static final Logger USER_ACTION_LOG = LoggerFactory.getLogger("USER_ACTION_LOGGER");
    private static final Logger ERROR_LOG = LoggerFactory.getLogger("ERROR_DIAGNOSTICS_LOGGER");

    @Pointcut("execution(public * ru.university.piaps.controller..*(..))")
    public void controllerMethods() {
    }

    @Pointcut("execution(public * ru.university.piaps.service.impl..*(..))")
    public void serviceMethods() {
    }

    @Pointcut("execution(public * ru.university.piaps.repository..*(..))")
    public void repositoryMethods() {
    }

    @Around("controllerMethods()")
    public Object logControllerCall(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = methodSignature(joinPoint);
        String args = summarizeArgs(joinPoint.getArgs());
        long startedAt = System.currentTimeMillis();
        OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Контроллер: {} | входные параметры: {}", method, args);
        try {
            Object result = joinPoint.proceed();
            OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Контроллер: {} | выполнен успешно за {} мс | результат: {}",
                    method, System.currentTimeMillis() - startedAt, summarizeResult(result));
            return result;
        } catch (Throwable ex) {
            String source = ErrorLogSupport.sourceLink(ex);
            ERROR_LOG.error("[ОШИБКА КОНТРОЛЛЕРА] {} | расшифровка={} | источник={}",
                    method, ErrorLogSupport.rootMessage(ex), source, ex);
            throw ex;
        }
    }

    @Around("serviceMethods()")
    public Object logServiceCall(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = methodSignature(joinPoint);
        String args = summarizeArgs(joinPoint.getArgs());
        long startedAt = System.currentTimeMillis();
        OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Сервис: {} | входные параметры: {}", method, args);
        try {
            Object result = joinPoint.proceed();
            long duration = System.currentTimeMillis() - startedAt;
            OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Сервис: {} | выполнен за {} мс", method, duration);
            if (isUserMutation(joinPoint)) {
                USER_ACTION_LOG.info("[ДЕЙСТВИЕ ПОЛЬЗОВАТЕЛЯ] {} | длительность={} мс | параметры={}",
                        method, duration, args);
            }
            return result;
        } catch (Throwable ex) {
            String source = ErrorLogSupport.sourceLink(ex);
            ERROR_LOG.error("[ОШИБКА СЕРВИСА] {} | расшифровка={} | источник={}",
                    method, ErrorLogSupport.rootMessage(ex), source, ex);
            throw ex;
        }
    }

    @Around("repositoryMethods()")
    public Object logRepositoryCall(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = methodSignature(joinPoint);
        long startedAt = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            OPERATION_LOG.info("[ОПЕРАЦИОННОЕ СОБЫТИЕ] Репозиторий: {} | выполнен за {} мс",
                    method, System.currentTimeMillis() - startedAt);
            return result;
        } catch (Throwable ex) {
            String source = ErrorLogSupport.sourceLink(ex);
            ERROR_LOG.error("[ОШИБКА РЕПОЗИТОРИЯ] {} | расшифровка={} | источник={}",
                    method, ErrorLogSupport.rootMessage(ex), source, ex);
            throw ex;
        }
    }

    private String methodSignature(ProceedingJoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String className = signature.getDeclaringType().getSimpleName();
        return className + "." + signature.getName();
    }

    private boolean isUserMutation(ProceedingJoinPoint joinPoint) {
        String methodName = joinPoint.getSignature().getName().toLowerCase();
        return methodName.startsWith("create")
                || methodName.startsWith("save")
                || methodName.startsWith("update")
                || methodName.startsWith("delete")
                || methodName.startsWith("remove")
                || methodName.startsWith("transfer")
                || methodName.startsWith("execute")
                || methodName.startsWith("rollback")
                || methodName.startsWith("sign");
    }

    private String summarizeArgs(Object[] args) {
        if (args == null || args.length == 0) {
            return "без параметров";
        }
        return Arrays.stream(args)
                .map(this::summarizeValue)
                .collect(Collectors.joining(", "));
    }

    private String summarizeResult(Object result) {
        if (result == null) {
            return "null";
        }
        return summarizeValue(result);
    }

    private String summarizeValue(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof String text) {
            String normalized = text.replaceAll("\\s+", " ").trim();
            if (normalized.length() > 120) {
                normalized = normalized.substring(0, 117) + "...";
            }
            return "\"" + normalized + "\"";
        }
        if (value instanceof Number || value instanceof Boolean || value instanceof Enum<?>) {
            return String.valueOf(value);
        }
        if (value instanceof Collection<?> collection) {
            return value.getClass().getSimpleName() + "(size=" + collection.size() + ")";
        }
        if (value instanceof Map<?, ?> map) {
            return "Map(size=" + map.size() + ")";
        }
        if (value.getClass().isArray()) {
            return value.getClass().getComponentType().getSimpleName() + "[]";
        }
        return value.getClass().getSimpleName();
    }
}
