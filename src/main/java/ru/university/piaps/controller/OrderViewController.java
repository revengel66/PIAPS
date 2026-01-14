package ru.university.piaps.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import ru.university.piaps.service.OrderService;

@Controller
@RequiredArgsConstructor
public class OrderViewController {

    private final OrderService orderService;

    @GetMapping("/orders/{id}/print")
    public String print(@PathVariable Long id, Model model) {
        model.addAttribute("order", orderService.findById(id));
        return "order-print";
    }
}
