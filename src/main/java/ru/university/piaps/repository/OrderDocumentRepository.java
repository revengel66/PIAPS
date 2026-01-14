package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.OrderDocument;

public interface OrderDocumentRepository extends JpaRepository<OrderDocument, Long> {
    boolean existsByNumber(String number);
}
