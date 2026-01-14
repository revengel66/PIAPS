package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public class ExpulsionTextStrategy implements OrderTextStrategy {
    @Override
    public String generate(OrderRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("На основании устава Ульяновского государственного технического университета и в соответствии ")
                .append("с законодательством Российской Федерации\n\n")
                .append("ПРИКАЗЫВАЮ:\n\n")
                .append("Считать отчисленными студентов по собственному желанию с указанной даты согласно приведённому списку.");
        if (request.getExpelDate() != null) {
            sb.append("\nДата отчисления: ").append(request.getExpelDate());
        }
        if (request.getBasis() != null) {
            sb.append("\nОснование: ").append(request.getBasis());
        }
        if (request.getContractInfo() != null) {
            sb.append("\nИнформация о договоре: ").append(request.getContractInfo());
        }
        return sb.toString();
    }
}
