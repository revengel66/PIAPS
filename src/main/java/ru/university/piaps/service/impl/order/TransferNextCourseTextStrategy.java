package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public class TransferNextCourseTextStrategy implements OrderTextStrategy {
    @Override
    public String generate(OrderRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("В связи с успешным завершением промежуточной аттестации и отсутствием академических задолженностей, ")
                .append("в соответствии с Положением об организации образовательного процесса в УлГТУ\n\n")
                .append("ПРИКАЗЫВАЮ:\n\n")
                .append("Перевести студентов на следующий курс обучения согласно приведённому списку.");
        if (request.getPreviousCourse() != null) {
            sb.append("\nПредыдущий курс: ").append(request.getPreviousCourse());
        }
        if (request.getNextCourse() != null) {
            sb.append("\nСледующий курс: ").append(request.getNextCourse());
        }
        if (request.getOldGroup() != null) {
            sb.append("\nИсходная группа: ").append(request.getOldGroup());
        }
        if (request.getNewGroup() != null) {
            sb.append("\nНовая группа: ").append(request.getNewGroup());
        }
        return sb.toString();
    }
}
