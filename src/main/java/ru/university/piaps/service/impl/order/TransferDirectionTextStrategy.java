package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public class TransferDirectionTextStrategy implements OrderTextStrategy {
    @Override
    public String generate(OrderRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("На основании заявления студента и в соответствии с положением и регламентом УлГТУ об образовании\n\n")
                .append("ПРИКАЗЫВАЮ:\n\n")
                .append("Перевести студентов по их собственному желанию на другое направление подготовки и в другую группу согласно приведённому списку.");
        if (request.getOldDirection() != null) {
            sb.append("\nСтарое направление: ").append(request.getOldDirection());
        }
        if (request.getOldGroup() != null) {
            sb.append("\nСтарая группа: ").append(request.getOldGroup());
        }
        if (request.getNewDirection() != null) {
            sb.append("\nНовое направление: ").append(request.getNewDirection());
        }
        if (request.getNewGroup() != null) {
            sb.append("\nНовая группа: ").append(request.getNewGroup());
        }
        if (request.getPreviousCourse() != null) {
            sb.append("\nКурс: ").append(request.getPreviousCourse());
        }
        return sb.toString();
    }
}
