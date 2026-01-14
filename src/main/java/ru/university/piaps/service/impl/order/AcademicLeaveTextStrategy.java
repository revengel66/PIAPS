package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public class AcademicLeaveTextStrategy implements OrderTextStrategy {
    @Override
    public String generate(OrderRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("В соответствии с российским законодательством и на основании Федерального закона \"Об образовании в Российской Федерации\", ")
                .append("Положения и регламента о порядке предоставления академических отпусков в УлГТУ\n\n")
                .append("ПРИКАЗЫВАЮ:\n\n")
                .append("Предоставить академический отпуск следующим студентам ")
                .append("в связи с личными (семейными) обстоятельствами либо по состоянию здоровья согласно приведённому списку.");
        if (request.getPeriodStart() != null && request.getPeriodEnd() != null) {
            sb.append("\nПериод: с ").append(request.getPeriodStart()).append(" по ").append(request.getPeriodEnd()).append(".");
        }
        if (request.getBasis() != null && !request.getBasis().isBlank()) {
            sb.append("\nОснование: ").append(request.getBasis());
        }
        return sb.toString();
    }
}
