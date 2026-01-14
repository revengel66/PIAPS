package ru.university.piaps.service;

import ru.university.piaps.dto.OrderDto;
import ru.university.piaps.dto.OrderRequest;

import java.util.List;

public interface OrderService {
    List<OrderDto> findAll();
    OrderDto findById(Long id);
    OrderDto create(OrderRequest request);
    OrderDto update(Long id, OrderRequest request);
    void delete(Long id);
}
