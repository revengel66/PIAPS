package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public class EnrollmentTextStrategy implements OrderTextStrategy {
    @Override
    public String generate(OrderRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("На основании Правил приёма в Ульяновский государственный технический университет и решения приёмной комиссии ")
                .append("в соответствии с законодательством\n\n")
                .append("ПРИКАЗЫВАЮ:\n\n")
                .append("Зачислить на первый курс студентов на обучение по соответствующим направлениям подготовки ")
                .append("с указанием формы и основы обучения.");
        if (request.getDirectionName() != null) {
            sb.append("\nНаправление: ").append(request.getDirectionName());
        }
        if (request.getGroupCode() != null) {
            sb.append("\nГруппа: ").append(request.getGroupCode());
        }
        if (request.getEducationForm() != null) {
            sb.append("\nФорма обучения: ").append(request.getEducationForm());
        }
        if (request.getEducationBase() != null) {
            sb.append("\nОснова обучения: ").append(request.getEducationBase());
        }
        if (request.getCostInfo() != null) {
            sb.append("\nСтоимость: ").append(request.getCostInfo());
        }
        return sb.toString();
    }
}
