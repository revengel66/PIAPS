package ru.university.piaps.service.impl.order;

import org.springframework.stereotype.Component;
import ru.university.piaps.model.OrderType;

import java.util.EnumMap;
import java.util.Map;

@Component
public class OrderTextStrategyFactory {

    private final Map<OrderType, OrderTextStrategy> strategies = new EnumMap<>(OrderType.class);

    public OrderTextStrategyFactory() {
        strategies.put(OrderType.ACADEMIC_LEAVE, new AcademicLeaveTextStrategy());
        strategies.put(OrderType.ENROLLMENT, new EnrollmentTextStrategy());
        strategies.put(OrderType.EXPULSION, new ExpulsionTextStrategy());
        strategies.put(OrderType.TRANSFER_DIRECTION, new TransferDirectionTextStrategy());
        strategies.put(OrderType.TRANSFER_NEXT_COURSE, new TransferNextCourseTextStrategy());
    }

    public OrderTextStrategy strategyFor(OrderType type) {
        OrderTextStrategy strategy = strategies.get(type);
        if (strategy == null) {
            throw new IllegalArgumentException("Неизвестный тип приказа: " + type);
        }
        return strategy;
    }
}
