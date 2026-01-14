package ru.university.piaps.service.impl.order;

import ru.university.piaps.dto.OrderRequest;

public interface OrderTextStrategy {
    String generate(OrderRequest request);
}
