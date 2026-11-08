package br.ufgd.gdcenter.structure;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class StructurePersistenceService {

    private static final Logger log = LoggerFactory.getLogger(StructurePersistenceService.class);
    private static final long SAVE_INTERVAL_MS = 1000L;

    private final StructureRepository repository;
    private final AtomicBoolean dirty = new AtomicBoolean(false);
    private final AtomicReference<List<Structure>> latestSnapshot = new AtomicReference<>(List.of());
    private ScheduledExecutorService writerExecutor;

    public StructurePersistenceService(StructureRepository repository) {
        this.repository = repository;
    }

    public List<Structure> loadInitialStructures() {
        List<Structure> initial = repository.loadAll();
        latestSnapshot.set(initial);
        return initial;
    }

    @PostConstruct
    public void start() {
        this.writerExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "gdcenter-structure-writer");
            t.setDaemon(true);
            return t;
        });
        this.writerExecutor.scheduleWithFixedDelay(
                this::flushIfDirtySafely,
                SAVE_INTERVAL_MS,
                SAVE_INTERVAL_MS,
                TimeUnit.MILLISECONDS
        );
    }

    public void markDirty(List<Structure> immutableStructures) {
        latestSnapshot.set(immutableStructures);
        dirty.set(true);
    }

    @PreDestroy
    public void stop() {
        if (writerExecutor != null) {
            writerExecutor.shutdown();
            try {
                writerExecutor.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        flushIfDirtySafely();
    }

    public void flushIfDirtySafely() {
        if (!dirty.compareAndSet(true, false)) {
            return;
        }
        try {
            List<Structure> snapshot = latestSnapshot.get();
            repository.saveAll(snapshot);
        } catch (Exception e) {
            dirty.set(true);
            log.error("Failed to persist structures to disk", e);
        }
    }
}
