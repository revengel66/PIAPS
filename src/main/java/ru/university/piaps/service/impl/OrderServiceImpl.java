package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.OrderDto;
import ru.university.piaps.dto.OrderRequest;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.OrderDocument;
import ru.university.piaps.repository.OrderDocumentRepository;
import ru.university.piaps.service.OrderService;
import ru.university.piaps.service.impl.order.OrderTextStrategyFactory;

import java.util.List;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    private final OrderDocumentRepository repository;
    private final OrderTextStrategyFactory textStrategyFactory;

    @Override
    @Transactional(readOnly = true)
    public List<OrderDto> findAll() {
        return repository.findAll().stream()
                .map(this::toDto)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OrderDto findById(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));
        return toDto(document);
    }

    @Override
    @Transactional
    public OrderDto create(OrderRequest request) {
        OrderDocument document = new OrderDocument();
        apply(request, document);
        document.setText(textStrategyFactory.strategyFor(request.getType()).generate(request));
        return toDto(repository.save(document));
    }

    @Override
    @Transactional
    public OrderDto update(Long id, OrderRequest request) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));
        apply(request, document);
        document.setText(textStrategyFactory.strategyFor(request.getType()).generate(request));
        return toDto(repository.save(document));
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Приказ не найден");
        }
        repository.deleteById(id);
    }

    private void apply(OrderRequest request, OrderDocument document) {
        document.setNumber(request.getNumber());
        document.setOrderDate(request.getOrderDate());
        document.setType(request.getType());
        document.setSignDate(request.getSignDate());
        document.setSignerPosition(request.getSignerPosition());
        document.setSignerName(request.getSignerName());
        document.setStudentsList(request.getStudentsList());
        document.setPeriodStart(request.getPeriodStart());
        document.setPeriodEnd(request.getPeriodEnd());
        document.setBasis(request.getBasis());
        document.setDirectionName(request.getDirectionName());
        document.setGroupCode(request.getGroupCode());
        document.setEducationForm(request.getEducationForm());
        document.setEducationBase(request.getEducationBase());
        document.setCostInfo(request.getCostInfo());
        document.setExpelDate(request.getExpelDate());
        document.setContractInfo(request.getContractInfo());
        document.setOldDirection(request.getOldDirection());
        document.setOldGroup(request.getOldGroup());
        document.setNewDirection(request.getNewDirection());
        document.setNewGroup(request.getNewGroup());
        document.setPreviousCourse(request.getPreviousCourse());
        document.setNextCourse(request.getNextCourse());
    }

    private OrderDto toDto(OrderDocument document) {
        return OrderDto.builder()
                .id(document.getId())
                .number(document.getNumber())
                .orderDate(document.getOrderDate())
                .type(document.getType())
                .text(document.getText())
                .signDate(document.getSignDate())
                .signerPosition(document.getSignerPosition())
                .signerName(document.getSignerName())
                .studentsList(document.getStudentsList())
                .periodStart(document.getPeriodStart())
                .periodEnd(document.getPeriodEnd())
                .basis(document.getBasis())
                .directionName(document.getDirectionName())
                .groupCode(document.getGroupCode())
                .educationForm(document.getEducationForm())
                .educationBase(document.getEducationBase())
                .costInfo(document.getCostInfo())
                .expelDate(document.getExpelDate())
                .contractInfo(document.getContractInfo())
                .oldDirection(document.getOldDirection())
                .oldGroup(document.getOldGroup())
                .newDirection(document.getNewDirection())
                .newGroup(document.getNewGroup())
                .previousCourse(document.getPreviousCourse())
                .nextCourse(document.getNextCourse())
                .build();
    }
}
