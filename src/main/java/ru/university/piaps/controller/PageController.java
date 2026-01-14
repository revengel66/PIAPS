package ru.university.piaps.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping({"/", "/dashboard"})
    public String dashboard() {
        return "dashboard";
    }

    @GetMapping("/students")
    public String studentsPage() {
        return "students";
    }

    @GetMapping("/groups")
    public String groupsPage() {
        return "groups";
    }

    @GetMapping("/directions")
    public String directionsPage() {
        return "directions";
    }

    @GetMapping("/curriculums")
    public String curriculumsPage() {
        return "curriculums";
    }

    @GetMapping("/orders")
    public String ordersPage() {
        return "orders";
    }

    @GetMapping("/reports")
    public String reportsPage() {
        return "reports";
    }
}
