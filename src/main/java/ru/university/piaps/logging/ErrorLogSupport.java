package ru.university.piaps.logging;

public final class ErrorLogSupport {

    private static final String APP_PACKAGE = "ru.university.piaps";

    private ErrorLogSupport() {
    }

    public static String rootMessage(Throwable throwable) {
        if (throwable == null) {
            return "";
        }
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage() == null ? current.getClass().getSimpleName() : current.getMessage();
    }

    public static String sourceLink(Throwable throwable) {
        if (throwable == null) {
            return "Источник не определён";
        }
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        for (StackTraceElement element : current.getStackTrace()) {
            if (element.getClassName() != null && element.getClassName().startsWith(APP_PACKAGE)) {
                return formatElement(element);
            }
        }
        StackTraceElement[] trace = current.getStackTrace();
        if (trace.length == 0) {
            return "Источник не определён";
        }
        return formatElement(trace[0]);
    }

    private static String formatElement(StackTraceElement element) {
        String className = element.getClassName();
        int dot = className.lastIndexOf('.');
        String shortClass = dot >= 0 ? className.substring(dot + 1) : className;
        return shortClass + "." + element.getMethodName() + "(" + element.getFileName() + ":" + element.getLineNumber() + ")";
    }
}
