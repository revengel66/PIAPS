package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import ru.university.piaps.model.OrderDocument;

import java.time.LocalDate;
import java.util.List;

public interface OrderDocumentRepository extends JpaRepository<OrderDocument, Long> {
    boolean existsByNumber(String number);
    boolean existsByNumberAndIdNot(String number, Long id);
    List<OrderDocument> findAllByOrderByOrderDateDescIdDesc();
    List<OrderDocument> findAllByOrderByOrderDateAscIdAsc();
    List<OrderDocument> findByOrderDateBetweenOrderByOrderDateAscIdAsc(LocalDate fromDate, LocalDate toDate);
    @Query("select o from OrderDocument o where o.signed is null or o.signed = false")
    List<OrderDocument> findAllUnsigned();
}
